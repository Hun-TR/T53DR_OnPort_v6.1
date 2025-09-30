#include "uart_handler.h"
#include "log_system.h"
#include "settings.h"
#include <Preferences.h>

// UART Pin tanımlamaları
#define UART_RX_PIN 4   // IO4 - RX2
#define UART_TX_PIN 14  // IO14 - TX2
#define UART_PORT   Serial2
#define UART_TIMEOUT 2000
#define UART_QUICK_TIMEOUT 500  // Hızlı sorgular için (YENİ EKLE)
#define MAX_RESPONSE_LENGTH 512 // Daha büyük buffer

#define UART3_RX_PIN 36  // IO36 - RX3
#define UART3_TX_PIN 33  // IO33 - TX3
#define UART3_PORT Serial1  // ESP32'de ikinci donanım UART'ı

static bool uart3Initialized = false;

// Global değişkenler
static unsigned long lastUARTActivity = 0;
static int uartErrorCount = 0;
bool uartHealthy = true;
String lastResponse = "";
UARTStatistics uartStats = {0, 0, 0, 0, 0, 100.0};

// Buffer temizleme
void clearUARTBuffer() {
    delay(50);
    while (UART_PORT.available()) {
        UART_PORT.read();
        delay(1);
    }
}

// UART istatistiklerini güncelle
void updateUARTStats(bool success) {
    if (success) {
        unsigned long total = uartStats.totalFramesSent + uartStats.totalFramesReceived;
        unsigned long errors = uartStats.frameErrors + uartStats.checksumErrors + uartStats.timeoutErrors;
        if (total > 0) {
            uartStats.successRate = ((float)(total - errors) / (float)total) * 100.0;
        }
    } else {
        uartStats.frameErrors++;
        unsigned long total = uartStats.totalFramesSent + uartStats.totalFramesReceived;
        unsigned long errors = uartStats.frameErrors + uartStats.checksumErrors + uartStats.timeoutErrors;
        if (total > 0) {
            uartStats.successRate = ((float)(total - errors) / (float)total) * 100.0;
        }
    }
}

// UART reset
void resetUART() {
    addLog("🔄 UART reset ediliyor...", WARN, "UART");
    
    UART_PORT.end();
    delay(200);
    
    pinMode(UART_RX_PIN, INPUT);
    pinMode(UART_TX_PIN, OUTPUT);
    digitalWrite(UART_TX_PIN, HIGH);
    
    UART_PORT.begin(250000, SERIAL_8N1, UART_RX_PIN, UART_TX_PIN);
    delay(200);
    
    clearUARTBuffer();
    
    lastUARTActivity = millis();
    uartErrorCount = 0;
    uartHealthy = true;
    
    addLog("✅ UART reset tamamlandı", SUCCESS, "UART");
    delay(500);
}

// UART başlatma
void initUART() {
    addLog("🚀 UART başlatılıyor...", INFO, "UART");
    
    pinMode(UART_RX_PIN, INPUT);
    pinMode(UART_TX_PIN, OUTPUT);
    
    UART_PORT.begin(250000, SERIAL_8N1, UART_RX_PIN, UART_TX_PIN);
    
    delay(100);
    clearUARTBuffer();
    
    lastUARTActivity = millis();
    uartErrorCount = 0;
    uartHealthy = true;
    
    addLog("✅ UART başlatıldı - TX2: IO" + String(UART_TX_PIN) + 
           ", RX2: IO" + String(UART_RX_PIN) + 
           ", Baud: 250000", SUCCESS, "UART");
    
    testUARTConnection();
}

// UART bağlantı testi
bool testUARTConnection() {
    addLog("🧪 UART bağlantısı test ediliyor...", INFO, "UART");
    
    if (UART_PORT.available()) {
        String response = "";
        while (UART_PORT.available() && response.length() < 50) {
            char c = UART_PORT.read();
            if (c >= 32 && c <= 126) {
                response += c;
            }
        }
        
        if (response.length() > 0) {
            addLog("✅ UART'da mevcut veri: '" + response + "'", SUCCESS, "UART");
            uartHealthy = true;
            lastUARTActivity = millis();
            return true;
        }
    }
    
    if (UART_PORT) {
        addLog("✅ UART portu aktif", SUCCESS, "UART");
        uartHealthy = true;
        return true;
    } else {
        addLog("❌ UART portu kapalı", ERROR, "UART");
        uartHealthy = false;
        return false;
    }
}

// YENİ - CHUNK OKUMA İLE:
String safeReadUARTResponse(unsigned long timeout) {
    String response = "";
    response.reserve(MAX_RESPONSE_LENGTH); // Belleği önceden ayır
    
    unsigned long startTime = millis();
    bool dataStarted = false;
    uint8_t buffer[64]; // Chunk okuma için buffer
    
    while (millis() - startTime < timeout) {
        int available = UART_PORT.available();
        
        if (available > 0) {
            lastUARTActivity = millis();
            uartHealthy = true;
            dataStarted = true;
            
            // CHUNK HALİNDE OKU (daha hızlı)
            int toRead = min(available, (int)sizeof(buffer));
            int bytesRead = UART_PORT.readBytes(buffer, toRead);
            
            for (int i = 0; i < bytesRead; i++) {
                char c = buffer[i];
                
                if (c == '\n' || c == '\r') {
                    if (response.length() > 0) {
                        uartStats.totalFramesReceived++;
                        return response;
                    }
                } else if (c >= 32 && c <= 126) {
                    response += c;
                    if (response.length() >= MAX_RESPONSE_LENGTH - 1) {
                        uartStats.totalFramesReceived++;
                        return response;
                    }
                }
            }
        } else if (dataStarted) {
            delay(5); // Veri başladıysa 5ms bekle
            if (!UART_PORT.available()) {
                if (response.length() > 0) {
                    uartStats.totalFramesReceived++;
                    return response;
                }
            }
        } else {
            yield(); // CPU'yu yorma
            delay(1);
        }
    }
    
    if (response.length() == 0) {
        uartStats.timeoutErrors++;
    }
    
    return response;
}

// Özel komut gönderme
bool sendCustomCommand(const String& command, String& response, unsigned long timeout) {
    if (command.length() == 0 || command.length() > 100) {
        return false;
    }
    
    if (!uartHealthy) {
        resetUART();
    }
    
    clearUARTBuffer();
    
    UART_PORT.print(command);
    UART_PORT.flush();
    
    uartStats.totalFramesSent++;
    
    response = safeReadUARTResponse(timeout == 0 ? UART_TIMEOUT : timeout);
    
    bool success = response.length() > 0;
    updateUARTStats(success);
    
    if (!success) {
        uartErrorCount++;
    }
    
    return success;
}

// BaudRate değiştirme
bool changeBaudRate(long baudRate) {
    addLog("ESP32 UART hızı sabit 250000'de kalıyor, sadece dsPIC'e kod gönderiliyor", INFO, "UART");
    return sendBaudRateCommand(baudRate);
}

// BaudRate komutunu gönder
bool sendBaudRateCommand(long baudRate) {
    String command = "";
    
    switch(baudRate) {
        case 9600:   command = "0Br";   break;
        case 19200:  command = "1Br";  break;
        case 38400:  command = "2Br";  break;
        case 57600:  command = "3Br";  break;
        case 115200: command = "4Br"; break;
        default:
            addLog("Geçersiz baudrate: " + String(baudRate), ERROR, "UART");
            return false;
    }
    
    clearUARTBuffer();
    
    UART_PORT.print(command);
    UART_PORT.flush();
    
    uartStats.totalFramesSent++;
    
    addLog("dsPIC33EP'ye baudrate kodu gönderildi: " + command, INFO, "UART");
    
    String response = safeReadUARTResponse(2000);
    
    if (response == "ACK" || response.indexOf("OK") >= 0) {
        addLog("✅ Baudrate kodu dsPIC33EP tarafından alındı", SUCCESS, "UART");
        updateUARTStats(true);
        return true;
    } else if (response.length() > 0) {
        addLog("dsPIC33EP yanıtı: " + response, WARN, "UART");
        updateUARTStats(true);
        return true;
    } else {
        addLog("❌ dsPIC33EP'den yanıt alınamadı", ERROR, "UART");
        updateUARTStats(false);
        return false;
    }
}

// uart_handler.cpp içindeki getCurrentBaudRateFromDsPIC fonksiyonu - DÜZELTİLMİŞ

// dsPIC'ten mevcut baudrate değerini al
int getCurrentBaudRateFromDsPIC() {
    clearUARTBuffer();
    
    // BN komutunu gönder
    UART_PORT.print("BN");
    UART_PORT.flush();
    
    uartStats.totalFramesSent++;
    
    addLog("📊 Mevcut baudrate sorgulanıyor (BN komutu)", DEBUG, "UART");
    
    String response = safeReadUARTResponse(2000);

    if (response.length() >= 2 && response.charAt(0) == 'B') {
        addLog("📥 Baudrate yanıtı: " + response, DEBUG, "UART");
        
        // ":" varsa ondan sonrasını al, yoksa eski formatı kullan
        int colonIndex = response.indexOf(':');
        String baudStr = (colonIndex >= 0) ? response.substring(colonIndex + 1)
                                           : response.substring(1);

        int baudIndex = baudStr.toInt();
        int baudRate = 0;
        
        switch(baudIndex) {
            case 0: baudRate = 9600; break;
            case 1: baudRate = 19200; break;
            case 2: baudRate = 38400; break;
            case 3: baudRate = 57600; break;
            case 4: baudRate = 115200; break;
            case 5: baudRate = 250000; break;
            default:
                addLog("❌ Tanımlanmamış baudrate indeksi: " + String(baudIndex), ERROR, "UART");
                return -1;
        }
        
        addLog("✅ Mevcut baudrate: " + String(baudRate) + " bps", SUCCESS, "UART");
        updateUARTStats(true);
        return baudRate;
    }
    
    // Buraya geldiysek, yanıt geçersiz veya boş demektir
    addLog("❌ Baudrate yanıtı alınamadı veya geçersiz format: " + response, ERROR, "UART");
    updateUARTStats(false);
    return -1;  // Hata değeri döndür
}


// UART3 başlatma
void initUART3() {
    if (uart3Initialized) return;
    
    pinMode(UART3_RX_PIN, INPUT);
    pinMode(UART3_TX_PIN, OUTPUT);
    
    UART3_PORT.begin(115200, SERIAL_8N1, UART3_RX_PIN, UART3_TX_PIN);
    
    delay(100);
    // Buffer'ı temizle
    while (UART3_PORT.available()) {
        UART3_PORT.read();
        delay(1);
    }
    
    uart3Initialized = true;
    addLog("✅ UART3 başlatıldı - TX: IO33, RX: IO36, Baud: 250000", SUCCESS, "UART3");
}

// İkinci karta veri gönderme - İyileştirilmiş versiyon
bool sendToSecondCard(const String& data) {
    if (!uart3Initialized) {
        initUART3();
        delay(100);
    }
    
    // Buffer'ı temizle
    while (UART3_PORT.available()) {
        UART3_PORT.read();
        delay(1);
    }
    
    // Veriyi gönder
    UART3_PORT.print(data);
    UART3_PORT.flush();
    
    // Biraz bekle - veri gönderimi tamamlansın
    delay(50);
    
    // ACK bekle
    unsigned long startTime = millis();
    String response = "";
    
    while (millis() - startTime < 2000) {
        if (UART3_PORT.available()) {
            char c = UART3_PORT.read();
            
            // Sadece görünür karakterleri al
            if (c >= 32 && c <= 126) {
                response += c;
                
                // ACK kontrolü
                if (response.endsWith("ACK")) {
                    addLog("✅ İkinci karttan ACK alındı", SUCCESS, "UART3");
                    return true;
                }
                
                // Buffer çok büyüdüyse temizle
                if (response.length() > 100) {
                    response = response.substring(response.length() - 50);
                }
            }
        }
        delay(5);
    }
    
    // Debug için alınan veriyi göster
    if (response.length() > 0) {
        addLog("İkinci karttan gelen: " + response, DEBUG, "UART3");
        
        // Hex formatında da göster
        String hexDump = "Hex: ";
        for (unsigned int i = 0; i < response.length() && i < 20; i++) {
            char hex[4];
            sprintf(hex, "%02X ", (unsigned char)response[i]);
            hexDump += hex;
        }
        addLog(hexDump, DEBUG, "UART3");
    }
    
    return false;
}

// ============ YENİ ARIZA SORGULAMA FONKSİYONLARI ============

// Toplam arıza sayısını al (AN komutu)
int getTotalFaultCount() {
    clearUARTBuffer();
    
    UART_PORT.print("AN");
    UART_PORT.flush();
    
    uartStats.totalFramesSent++;
    
    addLog("📊 Arıza sayısı sorgulanıyor (AN komutu)", DEBUG, "UART");
    
    String response = safeReadUARTResponse(2000);
    
    if (response.length() >= 2 && response.charAt(0) == 'A') {
        addLog("📥 Gelen yanıt: " + response, DEBUG, "UART");
        
        // A'dan sonrasını sayıya çevir
        String numberStr = response.substring(1);  
        int count = numberStr.toInt();
        
        // 50 - 1 = 49 mantığı
        int actualFaultCount = count - 1;
        
        if (actualFaultCount >= 0) {
            addLog("✅ Toplam arıza sayısı: " + String(actualFaultCount), SUCCESS, "UART");
            updateUARTStats(true);
            return actualFaultCount;
        }
    }
    
    addLog("❌ Arıza sayısı alınamadı veya geçersiz format: " + response, ERROR, "UART");
    updateUARTStats(false);
    return 0;
}

// Belirli bir arıza adresini sorgula
bool requestSpecificFault(int faultNumber) {
    // Hızlı buffer temizleme
    while (UART_PORT.available() && UART_PORT.available() < 100) {
        UART_PORT.read();
    }
    
    if (UART_PORT.available() >= 100) {
        while (UART_PORT.available()) {
            UART_PORT.read();
            delayMicroseconds(100); // Mikrosaniye bekle
        }
    }
    
    char command[10];
    sprintf(command, "%05dv", faultNumber);
    
    UART_PORT.print(command);
    UART_PORT.flush();
    
    uartStats.totalFramesSent++;
    
    // HIZLI TIMEOUT KULLAN
    lastResponse = safeReadUARTResponse(UART_QUICK_TIMEOUT); // 500ms
    
    if (lastResponse.length() > 0 && lastResponse != "E") {
        updateUARTStats(true);
        return true;
    } else {
        updateUARTStats(false);
        return false;
    }
}

// İlk arıza kaydını al (geriye uyumluluk için)
bool requestFirstFault() {
    return requestSpecificFault(1);
}

// Sonraki arıza kaydını al (DEPRECATED - kullanmayın)
bool requestNextFault() {
    addLog("⚠️ requestNextFault() artık kullanılmıyor. requestSpecificFault() kullanın.", WARN, "UART");
    return false;
}

// Son yanıtı al
String getLastFaultResponse() {
    return lastResponse;
}

// Test komutu gönder
bool sendTestCommand(const String& testCmd) {
    clearUARTBuffer();
    
    UART_PORT.print(testCmd);
    UART_PORT.flush();
    
    addLog("🧪 Test komutu gönderildi: " + testCmd, DEBUG, "UART");
    
    String response = safeReadUARTResponse(3000);
    
    if (response.length() > 0) {
        addLog("📡 Test yanıtı: " + response, DEBUG, "UART");
        return true;
    } else {
        addLog("❌ Test komutu için yanıt yok", WARN, "UART");
        return false;
    }
}

// UART sağlık kontrolü
void checkUARTHealth() {
    static unsigned long lastHealthCheck = 0;
    
    if (millis() - lastHealthCheck < 30000) {
        return;
    }
    lastHealthCheck = millis();
    
    // 5 dakika sessizlik kontrolü
    if (millis() - lastUARTActivity > 300000) {
        if (uartHealthy) {
            addLog("⚠️ UART 5 dakikadır sessiz", WARN, "UART");
            uartHealthy = false;
        }
    }
    
    // Çok fazla hata varsa reset
    if (uartErrorCount > 5) {
        addLog("🔄 Çok fazla UART hatası (" + String(uartErrorCount) + "), reset yapılıyor...", WARN, "UART");
        resetUART();
    }
    
    // Periyodik test
    if (!uartHealthy) {
        addLog("🩺 UART sağlık testi yapılıyor...", INFO, "UART");
        testUARTConnection();
    }
}

// UART durumunu al
String getUARTStatus() {
    String status = "UART Durumu:\n";
    status += "Sağlık: " + String(uartHealthy ? "✅ İyi" : "❌ Kötü") + "\n";
    status += "Son Aktivite: " + String((millis() - lastUARTActivity) / 1000) + " saniye önce\n";
    status += "Hata Sayısı: " + String(uartErrorCount) + "\n";
    status += "Başarı Oranı: " + String(uartStats.successRate, 1) + "%\n";
    status += "Gönderilen: " + String(uartStats.totalFramesSent) + "\n";
    status += "Alınan: " + String(uartStats.totalFramesReceived) + "\n";
    status += "Timeout: " + String(uartStats.timeoutErrors);
    return status;
}