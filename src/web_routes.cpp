// web_routes.cpp - Düzeltilmiş ve Temizlenmiş Routing
#include "web_routes.h"
#include "auth_system.h"
#include "settings.h"
#include "ntp_handler.h"
#include "uart_handler.h"
#include "log_system.h"
#include "backup_restore.h"
#include "password_policy.h"
#include <LittleFS.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <ESPmDNS.h>
#include "datetime_handler.h"
#include "fault_parser.h"

extern DateTimeData datetimeData;

// UART istatistikleri - extern olarak kullan (uart_handler.cpp'de tanımlı)
extern UARTStatistics uartStats;  // DÜZELTME: Burada tanımlama değil, extern kullanım

// Rate limiting için global değişkenler
struct RateLimitData {
    IPAddress clientIP;
    unsigned long requests[20];
    int requestIndex = 0;
    unsigned long lastReset = 0;
};
RateLimitData rateLimitData;

extern String getCurrentDateTime();
extern String getUptime();
extern bool isTimeSynced();
extern WebServer server;
extern Settings settings;
extern bool ntpConfigured;
extern PasswordPolicy passwordPolicy;
extern int logIndex;

// Arıza kayıtları için global array
static FaultRecord faultRecords[100]; // Maksimum 100 arıza kaydı
static int faultCount = 0;


// Security headers ekle
void addSecurityHeaders() {
    server.sendHeader("X-Content-Type-Options", "nosniff");
    server.sendHeader("X-Frame-Options", "DENY");
    server.sendHeader("X-XSS-Protection", "1; mode=block");
    server.sendHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    server.sendHeader("Content-Security-Policy", "default-src 'self' 'unsafe-inline'");

    // Gzip desteği bildirimi
    server.sendHeader("Accept-Encoding", "gzip, deflate");
}

// Rate limiting kontrolü
bool checkRateLimit() {
    IPAddress clientIP = server.client().remoteIP();
    unsigned long now = millis();
    
    // Farklı IP veya 1 dakika geçmişse sıfırla
    if (clientIP != rateLimitData.clientIP || now - rateLimitData.lastReset > 60000) {
        rateLimitData.clientIP = clientIP;
        rateLimitData.requestIndex = 0;
        rateLimitData.lastReset = now;
    }
    
    // 1 dakikada 60 istekten fazlasına izin verme
    if (rateLimitData.requestIndex >= 20) {
        addLog("⚠️ Rate limit aşıldı: " + clientIP.toString(), WARN, "SECURITY");
        return false;
    }
    
    rateLimitData.requests[rateLimitData.requestIndex++] = now;
    return true;
}

// Device Info API
void handleDeviceInfoAPI() {
    JsonDocument doc;
    doc["ip"] = ETH.localIP().toString();
    doc["mac"] = ETH.macAddress();
    doc["hostname"] = "teias-eklim";
    doc["mdns"] = "teias-eklim.local";
    doc["version"] = "v5.2";
    doc["model"] = "WT32-ETH01";
    
    String output;
    serializeJson(doc, output);
    
    addSecurityHeaders();
    server.send(200, "application/json", output);
}

// System Info API (Auth gerekli)
void handleSystemInfoAPI() {
    if (!checkSession()) {
        server.send(401, "application/json", "{\"error\":\"Unauthorized\"}");
        return;
    }
    
    // Rate limiting
    if (!checkRateLimit()) {
        server.send(429, "application/json", "{\"error\":\"Too many requests\"}");
        return;
    }
    
    JsonDocument doc;
    
    // Hardware info
    doc["hardware"]["chip"] = "ESP32";
    doc["hardware"]["cores"] = 2;
    doc["hardware"]["frequency"] = getCpuFrequencyMhz();
    doc["hardware"]["revision"] = ESP.getChipRevision();
    doc["hardware"]["flashSize"] = ESP.getFlashChipSize();
    
    // Memory info
    doc["memory"]["totalHeap"] = ESP.getHeapSize();
    doc["memory"]["freeHeap"] = ESP.getFreeHeap();
    doc["memory"]["usedHeap"] = ESP.getHeapSize() - ESP.getFreeHeap();
    doc["memory"]["minFreeHeap"] = ESP.getMinFreeHeap();
    doc["memory"]["maxAllocHeap"] = ESP.getMaxAllocHeap();
    
    // Software info
    doc["software"]["version"] = "5.2";
    doc["software"]["sdk"] = ESP.getSdkVersion();
    doc["software"]["buildDate"] = __DATE__ " " __TIME__;
    doc["software"]["uptime"] = millis() / 1000;
    
    // UART statistics - uartStats extern olarak kullanılıyor
    doc["uart"]["txCount"] = uartStats.totalFramesSent;
    doc["uart"]["rxCount"] = uartStats.totalFramesReceived;
    doc["uart"]["errors"] = uartStats.frameErrors + uartStats.checksumErrors + uartStats.timeoutErrors;
    doc["uart"]["successRate"] = uartStats.successRate;
    doc["uart"]["baudRate"] = 250000;  // settings.currentBaudRate yerine sabit değer
    
    // File system info
    size_t totalBytes = LittleFS.totalBytes();
    size_t usedBytes = LittleFS.usedBytes();
    doc["filesystem"]["type"] = "LittleFS";
    doc["filesystem"]["total"] = totalBytes;
    doc["filesystem"]["used"] = usedBytes;
    doc["filesystem"]["free"] = totalBytes - usedBytes;
    
    String output;
    serializeJson(doc, output);
    
    addSecurityHeaders();
    server.send(200, "application/json", output);
}

// Network Configuration API - GET
void handleGetNetworkAPI() {
    if (!checkSession()) {
        server.send(401, "application/json", "{\"error\":\"Unauthorized\"}");
        return;
    }
    
    addSecurityHeaders();
    
    JsonDocument doc;
    
    // Mevcut ethernet durumu
    doc["linkUp"] = ETH.linkUp();
    doc["linkSpeed"] = ETH.linkSpeed();
    doc["fullDuplex"] = ETH.fullDuplex();
    doc["mac"] = ETH.macAddress();
    
    // IP bilgileri
    doc["ip"] = ETH.localIP().toString();
    doc["gateway"] = ETH.gatewayIP().toString();
    doc["subnet"] = ETH.subnetMask().toString();
    doc["dns1"] = ETH.dnsIP().toString();
    doc["dns2"] = ETH.dnsIP(1).toString();
    
    // Şu an için her zaman static IP olarak göster
    doc["dhcp"] = false;
    
    String output;
    serializeJson(doc, output);
    
    server.send(200, "application/json", output);
}

// Network Configuration API - POST (Basit versiyon)
void handlePostNetworkAPI() {
    if (!checkSession()) {
        server.send(401, "application/json", "{\"error\":\"Unauthorized\"}");
        return;
    }
    
    addSecurityHeaders();
    
    String ipMode = server.arg("ipMode");
    
    if (ipMode == "static") {
        String staticIP = server.arg("staticIP");
        String gateway = server.arg("gateway");
        String subnet = server.arg("subnet");
        String dns1 = server.arg("dns1");
        
        // Basit IP validation
        IPAddress testIP;
        if (!testIP.fromString(staticIP)) {
            server.send(400, "application/json", "{\"error\":\"Geçersiz IP adresi\"}");
            return;
        }
        
        if (!testIP.fromString(gateway)) {
            server.send(400, "application/json", "{\"error\":\"Geçersiz Gateway adresi\"}");
            return;
        }
        
        // Settings'e kaydet
        Preferences prefs;
        prefs.begin("app-settings", false);
        prefs.putString("local_ip", staticIP);
        prefs.putString("gateway", gateway);
        prefs.putString("subnet", subnet);
        prefs.putString("dns", dns1);
        prefs.end();
        
        // Global settings güncelle
        settings.local_IP.fromString(staticIP);
        settings.gateway.fromString(gateway);
        settings.subnet.fromString(subnet);
        settings.primaryDNS.fromString(dns1);
        
        addLog("✅ Network ayarları kaydedildi: " + staticIP, SUCCESS, "NETWORK");
        
        server.send(200, "application/json", "{\"success\":true,\"message\":\"Ayarlar kaydedildi. Cihaz yeniden başlatılıyor...\"}");
        
        // Yeniden başlat
        delay(1000);
        ESP.restart();
        
    } else {
        server.send(400, "application/json", "{\"error\":\"Sadece static IP destekleniyor\"}");
    }
}

// Notification API
void handleNotificationAPI() {
    if (!checkSession()) {
        server.send(401, "application/json", "{\"error\":\"Unauthorized\"}");
        return;
    }
    
    JsonDocument doc;
    JsonArray notifications = doc.to<JsonArray>();
    
    // Son kritik logları bildirim olarak göster
    extern LogEntry logs[50];
    extern int totalLogs;
    int notificationCount = 0;
    
    for (int i = 0; i < totalLogs && notificationCount < 10; i++) {
        int idx = (logIndex - 1 - i + 50) % 50;
        if (logs[idx].level == ERROR || logs[idx].level == WARN) {
            JsonObject notif = notifications.add<JsonObject>();
            notif["id"] = idx;
            notif["type"] = (logs[idx].level == ERROR) ? "error" : "warning";
            notif["message"] = logs[idx].message;
            notif["time"] = logs[idx].timestamp;
            notif["read"] = false;
            notificationCount++;
        }
    }
    
    doc["count"] = notificationCount;
    
    String output;
    serializeJson(doc, output);
    
    addSecurityHeaders();
    server.send(200, "application/json", output);
}

// System Reboot API
void handleSystemRebootAPI() {
    if (!checkSession()) {
        server.send(401, "application/json", "{\"error\":\"Unauthorized\"}");
        return;
    }
    
    addLog("🔄 Sistem yeniden başlatılıyor...", WARN, "SYSTEM");
    server.send(200, "application/json", "{\"success\":true,\"message\":\"Sistem 3 saniye içinde yeniden başlatılacak\"}");
    
    delay(3000);
    ESP.restart();
}

// DateTime bilgisi çek - GET /api/datetime
void handleGetDateTimeAPI() {
    if (!checkSession()) {
        server.send(401, "application/json", "{\"error\":\"Unauthorized\"}");
        return;
    }
    
    addSecurityHeaders();
    
    JsonDocument doc;
    
    // Mevcut datetime verisi
    doc["isValid"] = isDateTimeDataValid();
    doc["date"] = datetimeData.date;
    doc["time"] = datetimeData.time;
    doc["rawData"] = datetimeData.rawData;
    
    if (datetimeData.lastUpdate > 0) {
        unsigned long elapsed = (millis() - datetimeData.lastUpdate) / 1000;
        doc["lastUpdate"] = String(elapsed) + " saniye önce";
        doc["lastUpdateTimestamp"] = datetimeData.lastUpdate;
    } else {
        doc["lastUpdate"] = "Henüz çekilmedi";
        doc["lastUpdateTimestamp"] = 0;
    }
    
    // ESP32 sistem saati
    doc["esp32DateTime"] = getCurrentESP32DateTime();
    
    String output;
    serializeJson(doc, output);
    
    server.send(200, "application/json", output);
}

// DateTime bilgisi güncelle - POST /api/datetime/fetch  
void handleFetchDateTimeAPI() {
    if (!checkSession()) {
        server.send(401, "application/json", "{\"error\":\"Unauthorized\"}");
        return;
    }
    
    addSecurityHeaders();
    
    addLog("DateTime bilgisi dsPIC'ten çekiliyor...", INFO, "DATETIME");
    
    bool success = requestDateTimeFromDsPIC();
    
    JsonDocument doc;
    doc["success"] = success;
    
    if (success) {
        doc["message"] = "Tarih-saat bilgisi başarıyla güncellendi";
        doc["date"] = datetimeData.date;
        doc["time"] = datetimeData.time;
        doc["rawData"] = datetimeData.rawData;
    } else {
        doc["message"] = "Tarih-saat bilgisi alınamadı";
        doc["error"] = "dsPIC'ten yanıt alınamadı veya format geçersiz";
    }
    
    String output;
    serializeJson(doc, output);
    
    server.send(success ? 200 : 500, "application/json", output);
}

// DateTime ayarla - POST /api/datetime/set
void handleSetDateTimeAPI() {
    if (!checkSession()) {
        server.send(401, "application/json", "{\"error\":\"Unauthorized\"}");
        return;
    }
    
    addSecurityHeaders();
    
    String manualDate = server.arg("manualDate");  // Format: 2025-02-27
    String manualTime = server.arg("manualTime");  // Format: 11:22:33
    
    // Input validation
    if (manualDate.length() == 0 || manualTime.length() == 0) {
        server.send(400, "application/json", "{\"error\":\"Tarih ve saat alanları boş olamaz\"}");
        return;
    }
    
    if (!validateDateTime(manualDate, manualTime)) {
        server.send(400, "application/json", "{\"error\":\"Geçersiz tarih veya saat formatı\"}");
        return;
    }
    
    addLog("Manual tarih-saat ayarlanıyor: " + manualDate + " " + manualTime, INFO, "DATETIME");
    
    bool success = setDateTimeToDsPIC(manualDate, manualTime);
    
    JsonDocument doc;
    doc["success"] = success;
    
    if (success) {
        doc["message"] = "Tarih-saat başarıyla ayarlandı";
        doc["setDate"] = manualDate;
        doc["setTime"] = manualTime;
        doc["timeCommand"] = formatTimeCommand(manualTime);
        doc["dateCommand"] = formatDateCommand(manualDate);
    } else {
        doc["message"] = "Tarih-saat ayarlanamadı";
        doc["error"] = "Komut gönderimi başarısız";
    }
    
    String output;
    serializeJson(doc, output);
    
    server.send(success ? 200 : 500, "application/json", output);
}



// handleSetCurrentTimeAPI fonksiyonunu güncelle
void handleSetCurrentTimeAPI() {
    // Bu fonksiyon artık kullanılmayacak
    // Bunun yerine client tarafında form alanları doldurulacak
    server.send(400, "application/json", "{\"error\":\"Bu endpoint artık kullanılmıyor\"}");
}


// mDNS güncelleme (teias-eklim.local)
void updateMDNS() {
    MDNS.end();
    
    if (MDNS.begin("teias-eklim")) {
        MDNS.addService("http", "tcp", 80);
        addLog("✅ mDNS güncellendi: teias-eklim.local", SUCCESS, "mDNS");
    } else {
        addLog("❌ mDNS başlatılamadı", ERROR, "mDNS");
    }
}

void serveStaticFile(const String& path, const String& contentType) {
    // Cache headers ekle
    String cacheControl = "public, max-age=";
    if (path.endsWith(".css") || path.endsWith(".js")) {
        cacheControl += "604800"; // 7 gün
        server.sendHeader("Cache-Control", cacheControl);
    } else if (path.endsWith(".html")) {
        cacheControl += "3600"; // 1 saat
        server.sendHeader("Cache-Control", cacheControl);
    }
    
    // ETag desteği için basit bir hash
    String etag = "\"" + String(path.length()) + "-" + String(LittleFS.totalBytes()) + "\"";
    server.sendHeader("ETag", etag);
    
    // Client ETag kontrolü
    if (server.hasHeader("If-None-Match")) {
        String clientEtag = server.header("If-None-Match");
        if (clientEtag == etag) {
            server.send(304); // Not Modified
            return;
        }
    }
    
    // Gzip kontrolü - ÖNCELİKLİ
    String pathWithGz = path + ".gz";
    if (LittleFS.exists(pathWithGz)) {
        File file = LittleFS.open(pathWithGz, "r");
        server.sendHeader("Content-Encoding", "gzip");
        server.sendHeader("Vary", "Accept-Encoding");
        server.streamFile(file, contentType);
        file.close();
        return;
    }

    // Normal dosya
    if (LittleFS.exists(path)) {
        File file = LittleFS.open(path, "r");
        server.streamFile(file, contentType);
        file.close();
        return;
    }

    server.send(404, "text/plain", "404: Not Found");
}


String getUptime() {
    unsigned long sec = millis() / 1000;
    char buffer[32];
    sprintf(buffer, "%lu:%02lu:%02lu", sec/3600, (sec%3600)/60, sec%60);
    return String(buffer);
}

// API Handler'lar
void handleStatusAPI() {
    if (!checkSession()) {
        server.send(401, "text/plain", "Unauthorized");
        return;
    }
    
    JsonDocument doc;
    doc["datetime"] = getCurrentDateTime();
    doc["uptime"] = getUptime();
    doc["deviceName"] = settings.deviceName;
    doc["tmName"] = settings.transformerStation;
    doc["deviceIP"] = ETH.localIP().toString();
    doc["ethernetStatus"] = ETH.linkUp();
    doc["timeSynced"] = isTimeSynced();
    doc["freeHeap"] = ESP.getFreeHeap();
    doc["totalHeap"] = ESP.getHeapSize();

    String output;
    serializeJson(doc, output);
    server.send(200, "application/json", output);
}

void handleGetSettingsAPI() {
    if (!checkSession()) { server.send(401); return; }
    JsonDocument doc;
    doc["deviceName"] = settings.deviceName;
    doc["tmName"] = settings.transformerStation;
    doc["username"] = settings.username;
    String output;
    serializeJson(doc, output);
    server.send(200, "application/json", output);
}

void handlePostSettingsAPI() {
    if (!checkSession()) { server.send(401); return; }
    if (saveSettings(server.arg("deviceName"), server.arg("tmName"), server.arg("username"), server.arg("password"))) {
        server.send(200, "text/plain", "OK");
    } else {
        server.send(400, "text/plain", "Error");
    }
}

// YENİ: Arıza sayısını al API'si
void handleGetFaultCountAPI() {
    if (!checkSession()) {
        server.send(401, "application/json", "{\"error\":\"Unauthorized\"}");
        return;
    }
    
    addLog("📊 Arıza sayısı sorgulanıyor", INFO, "API");
    
    int count = getTotalFaultCount(); // uart_handler.cpp'deki yeni fonksiyon
    
    JsonDocument doc;
    doc["success"] = (count > 0);
    doc["count"] = count;
    doc["message"] = count > 0 ? 
        "Toplam " + String(count) + " arıza bulundu" : 
        "Arıza sayısı alınamadı";
    
    String output;
    serializeJson(doc, output);
    
    addSecurityHeaders();
    server.send(200, "application/json", output);
}

// YENİ: Belirli bir arıza kaydını al
void handleGetSpecificFaultAPI() {
    if (!checkSession()) {
        server.send(401, "application/json", "{\"error\":\"Unauthorized\"}");
        return;
    }
    
    String faultNoStr = server.arg("faultNo");
    if (faultNoStr.length() == 0) {
        server.send(400, "application/json", "{\"error\":\"faultNo parameter required\"}");
        return;
    }
    
    int faultNo = faultNoStr.toInt();
    if (faultNo < 1 || faultNo > 9999) {
        server.send(400, "application/json", "{\"error\":\"Invalid fault number\"}");
        return;
    }
    
    addLog("🔍 Arıza " + String(faultNo) + " sorgulanıyor", INFO, "API");
    
    bool success = requestSpecificFault(faultNo);
    
    if (success) {
        String response = getLastFaultResponse();
        
        JsonDocument doc;
        doc["success"] = true;
        doc["faultNo"] = faultNo;
        doc["rawData"] = response;
        doc["length"] = response.length();
        
        String output;
        serializeJson(doc, output);
        
        server.send(200, "application/json", output);
    } else {
        server.send(500, "application/json", 
            "{\"success\":false,\"error\":\"Arıza kaydı alınamadı\"}");
    }
}

// Mevcut handleParsedFaultAPI fonksiyonunu GÜNCELLE
void handleParsedFaultAPI() {
    if (!checkSession()) {
        server.send(401, "application/json", "{\"error\":\"Unauthorized\"}");
        return;
    }
    
    String action = server.arg("action");
    
    if (action == "count") {
        // Toplam arıza sayısını döndür
        int count = getTotalFaultCount();
        
        JsonDocument doc;
        doc["success"] = (count > 0);
        doc["count"] = count;
        doc["message"] = count > 0 ? 
            String(count) + " adet arıza bulundu" : 
            "Sistemde arıza kaydı yok";
        
        String output;
        serializeJson(doc, output);
        server.send(200, "application/json", output);
        
    } else if (action == "get") {
        // Belirli bir arıza kaydını al ve parse et
        String faultNoStr = server.arg("faultNo");
        if (faultNoStr.length() == 0) {
            server.send(400, "application/json", "{\"error\":\"faultNo parameter required\"}");
            return;
        }
        
        int faultNo = faultNoStr.toInt();
        if (requestSpecificFault(faultNo)) {
            String rawResponse = getLastFaultResponse();
            FaultRecord fault = parseFaultData(rawResponse);
            
            if (fault.isValid) {
                JsonDocument doc;
                doc["success"] = true;
                doc["faultNo"] = faultNo;
                doc["fault"]["pinNumber"] = fault.pinNumber;
                doc["fault"]["pinType"] = fault.pinType;
                doc["fault"]["pinName"] = fault.pinName;
                doc["fault"]["dateTime"] = fault.dateTime;
                doc["fault"]["duration"] = formatDuration(fault.duration);
                doc["fault"]["durationSeconds"] = fault.duration;
                doc["fault"]["millisecond"] = fault.millisecond;
                doc["fault"]["rawData"] = fault.rawData;
                
                String output;
                serializeJson(doc, output);
                server.send(200, "application/json", output);
            } else {
                server.send(400, "application/json", 
                    "{\"success\":false,\"error\":\"" + fault.errorMessage + "\"}");
            }
        } else {
            server.send(500, "application/json", 
                "{\"success\":false,\"error\":\"Arıza kaydı alınamadı\"}");
        }
        
    } else if (action == "clear") {
        // Arıza kayıtlarını temizle (sadece ESP32 tarafında)
        faultCount = 0;
        server.send(200, "application/json", 
            "{\"success\":true,\"message\":\"Arıza kayıtları temizlendi\"}");
            
    } else {
        server.send(400, "application/json", 
            "{\"error\":\"Invalid action. Use: count, get, or clear\"}");
    }
}

// ✅ handleUARTTestAPI fonksiyonu
void handleUARTTestAPI() {
    if (!checkSession()) {
        server.send(401, "application/json", "{\"error\":\"Unauthorized\"}");
        return;
    }
    
    addLog("🧪 UART test başlatılıyor...", INFO, "WEB");
    
    JsonDocument doc;
    doc["uartHealthy"] = uartHealthy;
    doc["baudRate"] = 250000;
    
    // Basit test komutu gönder
    String testResponse;
    bool testResult = sendCustomCommand("TEST", testResponse, 2000);
    
    doc["testCommand"] = "TEST";
    doc["testSuccess"] = testResult;
    doc["testResponse"] = testResponse;
    doc["responseLength"] = testResponse.length();
    
    // İstatistikler
    doc["stats"]["sent"] = uartStats.totalFramesSent;
    doc["stats"]["received"] = uartStats.totalFramesReceived;
    doc["stats"]["errors"] = uartStats.frameErrors + uartStats.checksumErrors + uartStats.timeoutErrors;
    doc["stats"]["successRate"] = uartStats.successRate;
    
    String output;
    serializeJson(doc, output);
    
    addSecurityHeaders();
    server.send(200, "application/json", output);
}

void handleGetNtpAPI() {
    if (!checkSession()) { 
        server.send(401); 
        return; 
    }
    
    // Debug log ekle
    addLog("🌐 NTP ayarları web arayüzüne gönderiliyor", DEBUG, "API");
    addLog("📍 NTP1: " + String(ntpConfig.ntpServer1) + ", NTP2: " + String(ntpConfig.ntpServer2), DEBUG, "API");
    
    JsonDocument doc;
    
    // Global ntpConfig'den değerleri al
    String server1 = String(ntpConfig.ntpServer1);
    String server2 = String(ntpConfig.ntpServer2);
    
    // Eğer boşsa, Preferences'tan tekrar okumayı dene
    if (server1.length() == 0 || server1 == "") {
        Preferences preferences;
        preferences.begin("ntp-config", true);
        server1 = preferences.getString("ntp_server1", "192.168.1.1");
        server2 = preferences.getString("ntp_server2", "8.8.8.8");
        preferences.end();
        
        // Global config'i güncelle
        server1.toCharArray(ntpConfig.ntpServer1, sizeof(ntpConfig.ntpServer1));
        server2.toCharArray(ntpConfig.ntpServer2, sizeof(ntpConfig.ntpServer2));
        
        addLog("⚠️ NTP config boştu, Preferences'tan yeniden okundu", WARN, "API");
    }
    
    doc["ntpServer1"] = server1;
    doc["ntpServer2"] = server2;
    doc["timezone"] = ntpConfig.timezone;
    doc["enabled"] = ntpConfig.enabled;
    doc["configured"] = ntpConfigured;
    
    String output;
    serializeJson(doc, output);
    
    addLog("✅ NTP ayarları gönderildi: " + output, DEBUG, "API");
    
    server.send(200, "application/json", output);
}

// ✅ BU FONKSİYONU DA BULUN VE DEĞİŞTİRİN:
void handlePostNtpAPI() {
    if (!checkSession()) { 
        server.send(401); 
        return; 
    }
    
    String server1 = server.arg("ntpServer1");
    String server2 = server.arg("ntpServer2");
    
    addLog("📝 NTP ayarları kaydediliyor: NTP1=" + server1 + ", NTP2=" + server2, INFO, "API");
    
    // saveNTPSettings fonksiyonu zaten Preferences'a kaydediyor
    if (saveNTPSettings(server1, server2, 3)) {
        // Başarılı kayıt sonrası backend'e gönder
        sendNTPConfigToBackend();
        
        // Kontrol için tekrar oku
        Preferences preferences;
        preferences.begin("ntp-config", true);
        String checkServer1 = preferences.getString("ntp_server1", "");
        String checkServer2 = preferences.getString("ntp_server2", "");
        preferences.end();
        
        addLog("✅ NTP kayıt kontrolü - NTP1: " + checkServer1 + ", NTP2: " + checkServer2, SUCCESS, "API");
        
        JsonDocument doc;
        doc["success"] = true;
        doc["message"] = "NTP ayarları kaydedildi";
        doc["ntpServer1"] = checkServer1;
        doc["ntpServer2"] = checkServer2;
        
        String output;
        serializeJson(doc, output);
        
        server.send(200, "application/json", output);
    } else {
        server.send(400, "application/json", "{\"success\":false,\"error\":\"NTP ayarları kaydedilemedi\"}");
    }
}


// Baudrate değiştirme
void handlePostBaudRateAPI() {
    if (!checkSession()) { 
        server.send(401, "application/json", "{\"error\":\"Unauthorized\"}");
        return; 
    }
    
    String baudStr = server.arg("baud");
    if (baudStr.length() == 0) {
        server.send(400, "application/json", "{\"error\":\"Baudrate parametresi eksik\"}");
        return;
    }
    
    long newBaudRate = baudStr.toInt();
    
    addLog("⚙️ Baudrate değişikliği: " + String(newBaudRate) + " bps", INFO, "API");
    
    if (changeBaudRate(newBaudRate)) {
        // Başarılı değişiklik sonrası ayarları kaydet
        settings.currentBaudRate = newBaudRate;
        
        // Preferences ile kaydet
        Preferences prefs;
        prefs.begin("app-settings", false);
        prefs.putLong("baudRate", newBaudRate);
        prefs.end();
        
        JsonDocument doc;
        doc["success"] = true;
        doc["newBaudRate"] = newBaudRate;
        doc["message"] = "Baudrate başarıyla değiştirildi";
        
        String output;
        serializeJson(doc, output);
        server.send(200, "application/json", output);
    } else {
        server.send(500, "application/json", 
            "{\"success\":false,\"error\":\"Baudrate değiştirilemedi\"}");
    }
}

// Mevcut baudrate'i dsPIC'ten al
void handleGetCurrentBaudRateAPI() {
    if (!checkSession()) { 
        server.send(401, "application/json", "{\"error\":\"Unauthorized\"}");
        return; 
    }
    
    addLog("📡 Mevcut baudrate dsPIC'ten sorgulanıyor", INFO, "API");
    
    int currentBaud = getCurrentBaudRateFromDsPIC(); // uart_handler.cpp'deki yeni fonksiyon
    
    JsonDocument doc;
    if (currentBaud > 0) {
        doc["success"] = true;
        doc["currentBaudRate"] = currentBaud;
        doc["espBaudRate"] = 250000; // ESP32 her zaman 250000'de çalışıyor
        doc["message"] = "Baudrate başarıyla alındı";
        
        // Mevcut değeri storage'a da kaydet
        settings.currentBaudRate = currentBaud;
    } else {
        doc["success"] = false;
        doc["currentBaudRate"] = -1;
        doc["espBaudRate"] = 250000;
        doc["message"] = "dsPIC'ten baudrate bilgisi alınamadı";
    }
    
    String output;
    serializeJson(doc, output);
    
    addSecurityHeaders();
    server.send(200, "application/json", output);
}

// Password change sayfası için token kontrolü (ama atmaz)
void handlePasswordChangeCheck() {
    String token = "";
    if (server.hasHeader("Authorization")) {
        String authHeader = server.header("Authorization");
        if (authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7);
        }
    }
    
    // Token yoksa veya geçersizse sadece uyarı döndür
    if (token.length() == 0 || settings.sessionToken.length() == 0 || token != settings.sessionToken) {
        server.send(200, "application/json", "{\"validSession\":false,\"message\":\"Oturum geçersiz ama devam edebilirsiniz\"}");
    } else {
        server.send(200, "application/json", "{\"validSession\":true}");
    }
}

void handleGetLogsAPI() {
    if (!checkSession()) { 
        server.send(401, "application/json", "{\"error\":\"Unauthorized\"}");
        return; 
    }
    
    // Sayfa numarasını al (varsayılan 1)
    int pageNumber = 1;
    if (server.hasArg("page")) {
        pageNumber = server.arg("page").toInt();
        if (pageNumber < 1) pageNumber = 1;
    }
    
    // Filtre parametrelerini al (opsiyonel)
    String levelFilter = server.arg("level");  // all, ERROR, WARN, INFO, etc.
    String sourceFilter = server.arg("source"); // all veya belirli kaynak
    String searchFilter = server.arg("search"); // Arama terimi
    
    JsonDocument doc;
    
    // Pagination bilgileri
    doc["currentPage"] = pageNumber;
    doc["pageSize"] = PAGE_SIZE;
    doc["totalLogs"] = getTotalLogCount();
    doc["totalPages"] = getTotalPageCount();
    
    // Sayfa loglarını al
    std::vector<LogEntry> pageLogs = getLogsPage(pageNumber);
    
    JsonArray logArray = doc["logs"].to<JsonArray>();
    
    for (const auto& log : pageLogs) {
        // Filtreleme kontrolü
        bool includeLog = true;
        
        // Level filtresi
        if (levelFilter.length() > 0 && levelFilter != "all") {
            if (logLevelToString(log.level) != levelFilter) {
                includeLog = false;
            }
        }
        
        // Source filtresi  
        if (includeLog && sourceFilter.length() > 0 && sourceFilter != "all") {
            if (log.source != sourceFilter) {
                includeLog = false;
            }
        }
        
        // Arama filtresi
        if (includeLog && searchFilter.length() > 0) {
            String searchLower = searchFilter;
            searchLower.toLowerCase();
            String messageLower = log.message;
            messageLower.toLowerCase();
            String sourceLower = log.source;
            sourceLower.toLowerCase();
            
            if (messageLower.indexOf(searchLower) == -1 && 
                sourceLower.indexOf(searchLower) == -1) {
                includeLog = false;
            }
        }
        
        if (includeLog) {
            JsonObject logEntry = logArray.add<JsonObject>();
            logEntry["t"] = log.timestamp;
            logEntry["m"] = log.message;
            logEntry["l"] = logLevelToString(log.level);
            logEntry["s"] = log.source;
            logEntry["id"] = log.millis_time; // Unique ID için millis kullan
        }
    }
    
    // İstatistikler
    int errorCount = 0, warnCount = 0, infoCount = 0, successCount = 0;
    for (const auto& log : logStorage) {
        switch(log.level) {
            case ERROR: errorCount++; break;
            case WARN: warnCount++; break;
            case INFO: infoCount++; break;
            case SUCCESS: successCount++; break;
        }
    }
    
    doc["stats"]["errorCount"] = errorCount;
    doc["stats"]["warnCount"] = warnCount;
    doc["stats"]["infoCount"] = infoCount;
    doc["stats"]["successCount"] = successCount;
    
    String output;
    serializeJson(doc, output);
    
    addSecurityHeaders();
    server.send(200, "application/json", output);
}

// handleClearLogsAPI fonksiyonunu güncelle - GERÇEKTEN TEMİZLEYECEK
void handleClearLogsAPI() {
    if (!checkSession()) { 
        server.send(401, "application/json", "{\"error\":\"Unauthorized\"}");
        return; 
    }
    
    // Temizlemeden önce log sayısını kaydet
    int previousLogCount = getTotalLogCount();
    
    // GERÇEKTEN TÜM LOGLARI TEMİZLE
    clearLogs();
    
    // Başarılı yanıt
    JsonDocument doc;
    doc["success"] = true;
    doc["message"] = String(previousLogCount) + " log kaydı hafızadan temizlendi";
    doc["previousCount"] = previousLogCount;
    doc["currentCount"] = getTotalLogCount();
    
    String output;
    serializeJson(doc, output);
    
    addSecurityHeaders();
    server.send(200, "application/json", output);
    
    // Temizleme işlemini logla
    addLog("✅ " + String(previousLogCount) + " log kaydı kullanıcı tarafından temizlendi", SUCCESS, "SYSTEM");
}

void setupWebRoutes() {
    
    server.on("/favicon.ico", HTTP_GET, []() { server.send(204); });
    
    // ANA SAYFALAR (Oturum kontrolü yok, JS halledecek)
    server.on("/", HTTP_GET, []() { serveStaticFile("/index.html", "text/html"); });
    server.on("/login.html", HTTP_GET, []() { serveStaticFile("/login.html", "text/html"); });
    server.on("/password_change.html", HTTP_GET, []() { serveStaticFile("/password_change.html", "text/html"); });
    
    // STATİK DOSYALAR
    server.on("/style.css", HTTP_GET, []() { serveStaticFile("/style.css", "text/css"); });
    server.on("/script.js", HTTP_GET, []() { serveStaticFile("/script.js", "application/javascript"); });
    server.on("/login.js", HTTP_GET, []() { serveStaticFile("/login.js", "application/javascript"); });

    // SPA SAYFA PARÇALARI (Oturum kontrolü GEREKLİ)
    server.on("/pages/dashboard.html", HTTP_GET, []() { if(checkSession()) serveStaticFile("/pages/dashboard.html", "text/html"); else server.send(401); });
    server.on("/pages/network.html", HTTP_GET, []() { if(checkSession()) serveStaticFile("/pages/network.html", "text/html"); else server.send(401); });
    server.on("/pages/systeminfo.html", HTTP_GET, []() { if(checkSession()) serveStaticFile("/pages/systeminfo.html", "text/html"); else server.send(401); });
    server.on("/pages/ntp.html", HTTP_GET, []() { if(checkSession()) serveStaticFile("/pages/ntp.html", "text/html"); else server.send(401); });
    server.on("/pages/baudrate.html", HTTP_GET, []() { if(checkSession()) serveStaticFile("/pages/baudrate.html", "text/html"); else server.send(401); });
    server.on("/pages/fault.html", HTTP_GET, []() { if(checkSession()) serveStaticFile("/pages/fault.html", "text/html"); else server.send(401); });
    server.on("/pages/log.html", HTTP_GET, []() { if(checkSession()) serveStaticFile("/pages/log.html", "text/html"); else server.send(401); });
    server.on("/pages/datetime.html", HTTP_GET, []() { if(checkSession()) serveStaticFile("/pages/datetime.html", "text/html"); else server.send(401); });
    server.on("/pages/account.html", HTTP_GET, []() { if(checkSession()) serveStaticFile("/pages/account.html", "text/html"); else server.send(401); });
    server.on("/pages/backup.html", HTTP_GET, []() { if(checkSession()) serveStaticFile("/pages/backup.html", "text/html"); else server.send(401); });

    // KİMLİK DOĞRULAMA
    server.on("/login", HTTP_POST, handleUserLogin);
    server.on("/logout", HTTP_GET, handleUserLogout);

    // API ENDPOINT'LERİ

    // Device Info (Auth gerekmez)
    server.on("/api/device-info", HTTP_GET, handleDeviceInfoAPI);
    
    // System Info (Auth gerekli)
    server.on("/api/system-info", HTTP_GET, handleSystemInfoAPI);

    // Network Configuration
    server.on("/api/network", HTTP_GET, handleGetNetworkAPI);
    server.on("/api/network", HTTP_POST, handlePostNetworkAPI);

    // Notifications
    server.on("/api/notifications", HTTP_GET, handleNotificationAPI);
    
    // System Reboot
    server.on("/api/system/reboot", HTTP_POST, handleSystemRebootAPI);

    server.on("/api/status", HTTP_GET, handleStatusAPI);
    server.on("/api/settings", HTTP_GET, handleGetSettingsAPI);
    server.on("/api/settings", HTTP_POST, handlePostSettingsAPI);
    server.on("/api/ntp", HTTP_GET, handleGetNtpAPI);
    server.on("/api/ntp", HTTP_POST, handlePostNtpAPI);
    server.on("/api/baudrate/current", HTTP_GET, handleGetCurrentBaudRateAPI);  // Mevcut baudrate sorgula
    server.on("/api/baudrate", HTTP_POST, handlePostBaudRateAPI);   // Baudrate değiştir
    server.on("/api/logs", HTTP_GET, handleGetLogsAPI);
    server.on("/api/logs/clear", HTTP_POST, handleClearLogsAPI);
    // DateTime API endpoints
    server.on("/api/datetime", HTTP_GET, handleGetDateTimeAPI);
    server.on("/api/datetime/fetch", HTTP_POST, handleFetchDateTimeAPI);
    server.on("/api/datetime/set", HTTP_POST, handleSetDateTimeAPI);
    // ✅ UART Test API'si ekle
    server.on("/api/uart/test", HTTP_GET, handleUARTTestAPI);

    // YENİ route'ları EKLE:
    server.on("/api/faults/count", HTTP_GET, handleGetFaultCountAPI);
    server.on("/api/faults/get", HTTP_POST, handleGetSpecificFaultAPI);
    server.on("/api/faults/parsed", HTTP_POST, handleParsedFaultAPI); // Güncellendi

     // ✅ Fault komutları için debug endpoint'leri
    server.on("/api/uart/send", HTTP_POST, []() {
        if (!checkSession()) {
            server.send(401, "application/json", "{\"error\":\"Unauthorized\"}");
            return;
        }
        
        String command = server.arg("command");
        if (command.length() == 0) {
            server.send(400, "application/json", "{\"error\":\"Command parameter required\"}");
            return;
        }
        
        addLog("🧪 Manuel komut gönderiliyor: " + command, INFO, "UART");
        
        String response;
        bool success = sendCustomCommand(command, response, 3000);
        
        JsonDocument doc;
        doc["command"] = command;
        doc["success"] = success;
        doc["response"] = response;
        doc["responseLength"] = response.length();
        doc["timestamp"] = getFormattedTimestamp();
        
        String output;
        serializeJson(doc, output);
        
        server.send(200, "application/json", output);
    });

    
    server.on("/api/backup/download", HTTP_GET, handleBackupDownload);
    // Yedek yükleme için doğru handler tanımı
    server.on("/api/backup/upload", HTTP_POST, 
        []() { server.send(200, "text/plain", "OK"); }, // Önce bir OK yanıtı gönderilir
        handleBackupUpload // Sonra dosya yükleme işlenir
    );
    server.on("/api/change-password", HTTP_POST, handlePasswordChangeAPI);

    // Password Change Check (soft check)
    server.on("/api/check-password-session", HTTP_GET, handlePasswordChangeCheck);
    
    // Her response'ta security headers ekle
    server.onNotFound([]() {
        addSecurityHeaders();
        addLog("404 isteği: " + server.uri(), WARN, "WEB");
        server.send(404, "application/json", "{\"error\":\"Not Found\"}");
    });
    
    server.begin();
    addLog("✅ Web sunucu başlatıldı", SUCCESS, "WEB");
}