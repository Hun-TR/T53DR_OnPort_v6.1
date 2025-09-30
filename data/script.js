// TEİAŞ EKLİM v5.2 - Tüm eksiklikler giderilmiş versiyon

document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. UYGULAMA DURUMU (STATE) VE AYARLAR ---
    const state = {
        token: localStorage.getItem('sessionToken') || null,
        logPaused: false,
        autoScroll: true,
        pollingIntervals: {
            status: null,
            logs: null,
            faults: null,
            notifications: null,
            systemInfo: null
        }
    };

    // Klavye navigasyonu için
document.addEventListener('keydown', function(e) {
    if (e.target.classList.contains('ip-part')) {
        // Backspace ile geri gitme
        if (e.key === 'Backspace' && e.target.value === '') {
            const part = parseInt(e.target.dataset.part);
            if (part > 1) {
                const prevInput = e.target.parentElement.querySelector(`.ip-part[data-part="${part - 1}"]`);
                if (prevInput) {
                    prevInput.focus();
                    prevInput.select();
                }
            }
        }
        // Sol ok ile geri gitme
        else if (e.key === 'ArrowLeft' && e.target.selectionStart === 0) {
            const part = parseInt(e.target.dataset.part);
            if (part > 1) {
                const prevInput = e.target.parentElement.querySelector(`.ip-part[data-part="${part - 1}"]`);
                if (prevInput) {
                    prevInput.focus();
                    prevInput.select();
                }
            }
        }
        // Sağ ok ile ileri gitme
        else if (e.key === 'ArrowRight' && e.target.selectionStart === e.target.value.length) {
            const part = parseInt(e.target.dataset.part);
            if (part < 4) {
                const nextInput = e.target.parentElement.querySelector(`.ip-part[data-part="${part + 1}"]`);
                if (nextInput) {
                    nextInput.focus();
                    nextInput.select();
                }
            }
        }
    }
});

    // --- 2. SAYFA BAŞLATMA FONKSİYONLARI ---
    
    // Gösterge Paneli
    function initDashboardPage() {
        console.log("Gösterge paneli başlatılıyor...");
        const updateStatus = () => {
            secureFetch('/api/status')
                .then(response => response && response.json())
                .then(data => data && updateDashboardUI(data))
                .catch(error => {
                    console.error('Durum verileri alınamadı:', error);
                    showMessage('Durum verileri alınamadı', 'error');
                });
        };
        updateStatus();
        state.pollingIntervals.status = setInterval(updateStatus, 5000);
    }
    
// Network Ayarları Sayfası - GELİŞTİRİLMİŞ VERSİYON
function initNetworkPage() {
    console.log("🌐 Network sayfası başlatılıyor...");
    
    const form = document.getElementById('networkForm');
    const dhcpRadio = document.getElementById('dhcp');
    const staticRadio = document.getElementById('static');
    const staticSettings = document.getElementById('staticSettings');
    const refreshNetworkBtn = document.getElementById('refreshNetworkBtn');
    
    if (!form) {
        console.error('❌ Network form bulunamadı!');
        return;
    }
    
    // Mevcut network durumunu yükle
    loadNetworkStatus();
    
    // DHCP/Static toggle event listeners
    if (dhcpRadio) {
        dhcpRadio.addEventListener('change', function() {
            if (this.checked && staticSettings) {
                staticSettings.style.display = 'none';
                console.log('📡 DHCP modu seçildi');
                clearStaticFields();
            }
        });
    }
    
    if (staticRadio) {
        staticRadio.addEventListener('change', function() {
            if (this.checked && staticSettings) {
                staticSettings.style.display = 'block';
                console.log('🔧 Static IP modu seçildi');
            }
        });
    }
    
    // IP validation helper
    function validateIPAddress(ip) {
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return ipRegex.test(ip);
    }
    
    // Static alanları temizle
    function clearStaticFields() {
        const fields = ['staticIP', 'gateway', 'subnet', 'dns1', 'dns2'];
        fields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) field.value = '';
        });
    }
    
    // Real-time IP validation
    const ipInputs = ['staticIP', 'gateway', 'subnet', 'dns1', 'dns2'];
    ipInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('blur', function() {
                if (this.value && !validateIPAddress(this.value)) {
                    this.style.borderColor = 'var(--error)';
                    this.style.backgroundColor = 'rgba(245, 101, 101, 0.1)';
                    showMessage(`Geçersiz IP adresi: ${this.value}`, 'error');
                } else {
                    this.style.borderColor = '';
                    this.style.backgroundColor = '';
                }
            });
            
            // Enter tuşu ile sonraki alana geç
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const currentIndex = ipInputs.indexOf(inputId);
                    if (currentIndex < ipInputs.length - 1) {
                        const nextInput = document.getElementById(ipInputs[currentIndex + 1]);
                        if (nextInput) nextInput.focus();
                    } else {
                        // Son alan, form submit
                        form.dispatchEvent(new Event('submit'));
                    }
                }
            });
        }
    });
    
    // Form validation
    function validateNetworkForm() {
        if (staticRadio && staticRadio.checked) {
            const requiredFields = ['staticIP', 'gateway', 'subnet', 'dns1'];
            
            for (const fieldId of requiredFields) {
                const field = document.getElementById(fieldId);
                if (!field || !field.value.trim()) {
                    showMessage(`${fieldId} alanı zorunludur`, 'error');
                    if (field) {
                        field.style.borderColor = 'var(--error)';
                        field.focus();
                    }
                    return false;
                }
                
                if (!validateIPAddress(field.value.trim())) {
                    showMessage(`Geçersiz IP adresi: ${field.value}`, 'error');
                    field.style.borderColor = 'var(--error)';
                    field.focus();
                    return false;
                }
            }
            
            // DNS2 opsiyonel ama girilmişse valid olmalı
            const dns2 = document.getElementById('dns2');
            if (dns2 && dns2.value.trim() && !validateIPAddress(dns2.value.trim())) {
                showMessage(`Geçersiz DNS2 adresi: ${dns2.value}`, 'error');
                dns2.style.borderColor = 'var(--error)';
                dns2.focus();
                return false;
            }
        }
        
        return true;
    }
    
    // Form gönderim handler'ı
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        if (!validateNetworkForm()) {
            return;
        }
        
        const saveBtn = document.getElementById('saveNetworkBtn');
        const btnText = saveBtn?.querySelector('.btn-text');
        const btnLoader = saveBtn?.querySelector('.btn-loader');
        
        // Loading state
        if (saveBtn) saveBtn.disabled = true;
        if (btnText) btnText.style.display = 'none';
        if (btnLoader) btnLoader.style.display = 'inline-block';
        
        const formData = new FormData(form);
        
        // Debug: Form verilerini logla
        console.log('📤 Network form verileri gönderiliyor...');
        for (let [key, value] of formData.entries()) {
            console.log(`${key}: ${value}`);
        }
        
        try {
            const response = await secureFetch('/api/network', {
                method: 'POST',
                body: new URLSearchParams(formData)
            });
            
            if (response && response.ok) {
                const result = await response.json();
                showMessage(result.message || 'Network ayarları kaydedildi! Cihaz yeniden başlatılıyor...', 'success');
                
                // Countdown timer göster
                let countdown = 10;
                const countdownInterval = setInterval(() => {
                    showMessage(`Cihaz ${countdown} saniye içinde yeniden başlatılıyor...`, 'warning');
                    countdown--;
                    
                    if (countdown < 0) {
                        clearInterval(countdownInterval);
                        // Yeni IP ile yönlendirme
                        const newIP = formData.get('staticIP');
                        if (newIP) {
                            window.location.href = `http://${newIP}`;
                        } else {
                            window.location.href = '/';
                        }
                    }
                }, 1000);
                
            } else {
                const errorText = response ? await response.text() : 'Ağ hatası';
                showMessage('Network ayarları kaydedilemedi: ' + errorText, 'error');
            }
        } catch (error) {
            console.error('❌ Network kayıt hatası:', error);
            showMessage('Network ayarları kaydedilirken bir hata oluştu', 'error');
        } finally {
            // Reset loading state
            if (saveBtn) saveBtn.disabled = false;
            if (btnText) btnText.style.display = 'inline';
            if (btnLoader) btnLoader.style.display = 'none';
        }
    });
    
    // Yenile butonu
    if (refreshNetworkBtn) {
        refreshNetworkBtn.addEventListener('click', function() {
            showMessage('Sayfa yenileniyor...', 'info');
            setTimeout(() => {
                location.reload();
            }, 500);
        });
    }
    
    // Network test butonu (eğer varsa)
    const networkTestBtn = document.getElementById('networkTestBtn');
    if (networkTestBtn) {
        networkTestBtn.addEventListener('click', async function() {
            showMessage('Network bağlantısı test ediliyor...', 'info');
            
            try {
                const response = await secureFetch('/api/network');
                if (response && response.ok) {
                    const data = await response.json();
                    if (data.linkUp) {
                        showMessage('✅ Network bağlantısı başarılı', 'success');
                    } else {
                        showMessage('❌ Network bağlantısı yok', 'error');
                    }
                }
            } catch (error) {
                showMessage('Network testi başarısız', 'error');
            }
        });
    }
    
    // Preset butonları ekle
    setTimeout(() => {
        addNetworkPresets();
    }, 1000);
    
    console.log('✅ Network sayfası hazır');
}

// Network durumu yükleme fonksiyonu
async function loadNetworkStatus() {
    try {
        console.log('🔄 Network durumu yükleniyor...');
        
        const response = await secureFetch('/api/network');
        if (response && response.ok) {
            const data = await response.json();
            console.log('📊 Network verisi alındı:', data);
            
            // Durum göstergelerini güncelle
            updateElement('ethStatus', data.linkUp ? 'Bağlı' : 'Bağlı Değil');
            updateElement('currentIP', data.ip || 'Bilinmiyor');
            updateElement('macAddress', data.mac || 'Bilinmiyor');
            updateElement('linkSpeed', (data.linkSpeed || 0) + ' Mbps');
            updateElement('currentGateway', data.gateway || 'Bilinmiyor');
            updateElement('currentDNS', data.dns1 || 'Bilinmiyor');
            
            // Status badge rengini güncelle
            const ethStatusEl = document.getElementById('ethStatus');
            if (ethStatusEl) {
                ethStatusEl.className = `status-value ${data.linkUp ? 'online' : 'offline'}`;
            }
            
            // Form değerlerini doldur
            const dhcpRadio = document.getElementById('dhcp');
            const staticRadio = document.getElementById('static');
            const staticSettings = document.getElementById('staticSettings');
            
            if (data.dhcp && dhcpRadio) {
                dhcpRadio.checked = true;
                if (staticSettings) staticSettings.style.display = 'none';
                console.log('📡 DHCP modu aktif');
            } else if (staticRadio) {
                staticRadio.checked = true;
                if (staticSettings) staticSettings.style.display = 'block';
                
                // Static IP değerlerini doldur
                updateElement('staticIP', data.ip);
                updateElement('gateway', data.gateway);
                updateElement('subnet', data.subnet);
                updateElement('dns1', data.dns1);
                updateElement('dns2', data.dns2 || '');
                
                console.log('🔧 Static IP modu aktif');
            }
            
        } else {
            console.error('❌ Network durumu alınamadı');
            showMessage('Network bilgileri yüklenemedi', 'error');
        }
    } catch (error) {
        console.error('❌ Network durumu yükleme hatası:', error);
        showMessage('Network durumu yüklenirken hata oluştu', 'error');
    }
}

// Network preset butonları ekle
function addNetworkPresets() {
    const staticSettings = document.getElementById('staticSettings');
    if (!staticSettings || staticSettings.querySelector('.network-presets')) return;
    
    const presetsHTML = `
        <div class="network-presets" style="margin: 1rem 0; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-primary);">
            <h4 style="margin-bottom: 0.5rem; color: var(--text-primary); font-size: 0.875rem;">🚀 Hızlı IP Ayarları</h4>
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                <button type="button" class="preset-network-btn" data-ip="192.168.1.100" data-gw="192.168.1.1" data-subnet="255.255.255.0" data-dns="8.8.8.8">
                    🏠 Ev Ağı (192.168.1.x)
                </button>
                <button type="button" class="preset-network-btn" data-ip="192.168.0.100" data-gw="192.168.0.1" data-subnet="255.255.255.0" data-dns="1.1.1.1">
                    🏢 Ofis Ağı (192.168.0.x)
                </button>
                <button type="button" class="preset-network-btn" data-ip="10.0.0.100" data-gw="10.0.0.1" data-subnet="255.255.255.0" data-dns="8.8.4.4">
                    🏭 Kurumsal (10.0.0.x)
                </button>
            </div>
        </div>
    `;
    
    staticSettings.insertAdjacentHTML('beforeend', presetsHTML);
    
    // Event listeners ekle
    staticSettings.querySelectorAll('.preset-network-btn').forEach(btn => {
        btn.style.cssText = `
            padding: 0.25rem 0.5rem;
            background: linear-gradient(135deg, var(--bg-tertiary), var(--bg-secondary));
            border: 1px solid var(--border-primary);
            border-radius: var(--radius-full);
            color: var(--text-secondary);
            font-size: 0.75rem;
            cursor: pointer;
            transition: all var(--transition-fast);
        `;
        
        btn.addEventListener('mouseover', function() {
            this.style.background = 'linear-gradient(135deg, var(--primary), var(--secondary))';
            this.style.color = 'white';
        });
        
        btn.addEventListener('mouseout', function() {
            this.style.background = 'linear-gradient(135deg, var(--bg-tertiary), var(--bg-secondary))';
            this.style.color = 'var(--text-secondary)';
        });
        
        btn.addEventListener('click', function() {
            const ip = this.dataset.ip;
            const gw = this.dataset.gw;
            const subnet = this.dataset.subnet;
            const dns = this.dataset.dns;
            
            // Değerleri doldur
            updateElement('staticIP', ip);
            updateElement('gateway', gw);
            updateElement('subnet', subnet);
            updateElement('dns1', dns);
            
            showMessage(`✅ ${this.textContent.trim()} ayarları yüklendi`, 'success');
        });
    });
}

// updateElement fonksiyonu güvenli versiyon
function updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
        if (element.tagName === 'INPUT') {
            element.value = value || '';
        } else {
            element.textContent = value || '';
        }
    }
}
// DateTime sayfası başlatma fonksiyonu
function initDateTimePage() {
    console.log('🕒 DateTime sayfası başlatılıyor...');
    
    // Sayfa elementleri
    const getDateTimeBtn = document.getElementById('getDateTimeBtn');
    const refreshDateTimeBtn = document.getElementById('refreshDateTimeBtn');
    const datetimeForm = document.getElementById('datetimeForm');
    const setCurrentBtn = document.getElementById('setCurrentBtn');
    const resetFormBtn = document.getElementById('resetFormBtn');
    
    if (!getDateTimeBtn) {
        console.error('DateTime sayfa elementleri bulunamadı');
        return;
    }
    
    // İlk yüklemede datetime bilgisini çek
    loadDateTimeStatus();
    
    // Event listener'ları ekle
    getDateTimeBtn.addEventListener('click', fetchDateTimeFromDsPIC);
    refreshDateTimeBtn.addEventListener('click', loadDateTimeStatus);
    datetimeForm.addEventListener('submit', handleSetDateTime);
    setCurrentBtn.addEventListener('click', setCurrentDateTime);
    resetFormBtn.addEventListener('click', resetDateTimeForm);
    
    console.log('✅ DateTime sayfası hazır');
}

// DateTime durumunu yükle
async function loadDateTimeStatus() {
    try {
        console.log('📡 DateTime durumu yükleniyor...');
        
        const response = await secureFetch('/api/datetime');
        if (response && response.ok) {
            const data = await response.json();
            
            // UI'ı güncelle
            updateElement('currentDate', data.date || '--/--/--');
            updateElement('currentTime', data.time || '--:--:--');
            updateElement('lastUpdate', data.lastUpdate || 'Henüz çekilmedi');
            updateElement('rawData', data.rawData || 'Bekleniyor...');
            
            console.log('✅ DateTime durumu yüklendi:', data);
        } else {
            console.error('❌ DateTime durumu yüklenemedi');
            showMessage('DateTime durumu yüklenemedi', 'error');
        }
    } catch (error) {
        console.error('DateTime durumu yükleme hatası:', error);
        showMessage('DateTime durumu yüklenirken hata oluştu', 'error');
    }
}

// dsPIC'ten datetime bilgisi çek
async function fetchDateTimeFromDsPIC() {
    const getBtn = document.getElementById('getDateTimeBtn');
    const btnText = getBtn.querySelector('.btn-text');
    const btnIcon = getBtn.querySelector('.btn-icon');
    
    // Loading state
    getBtn.disabled = true;
    btnIcon.textContent = '⏳';
    btnText.textContent = 'Çekiliyor...';
    
    try {
        console.log('📡 dsPIC\'ten datetime çekiliyor...');
        
        const response = await secureFetch('/api/datetime/fetch', {
            method: 'POST'
        });
        
        if (response && response.ok) {
            const data = await response.json();
            
            if (data.success) {
                // UI'ı güncelle
                updateElement('currentDate', data.date);
                updateElement('currentTime', data.time);
                updateElement('lastUpdate', 'Az önce');
                updateElement('rawData', data.rawData);
                
                showMessage('✅ Tarih-saat bilgisi başarıyla güncellendi', 'success');
                console.log('✅ DateTime çekildi:', data);
            } else {
                showMessage('❌ ' + (data.message || 'Tarih-saat bilgisi alınamadı'), 'error');
                console.error('DateTime fetch başarısız:', data);
            }
        } else {
            showMessage('❌ Sunucu hatası', 'error');
        }
    } catch (error) {
        console.error('DateTime fetch hatası:', error);
        showMessage('❌ DateTime bilgisi çekilirken hata oluştu', 'error');
    } finally {
        // Reset loading state
        getBtn.disabled = false;
        btnIcon.textContent = '📥';
        btnText.textContent = 'Sistem Saatini Çek';
    }
}

// DateTime ayarlama formu
async function handleSetDateTime(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const manualDate = formData.get('manualDate');
    const manualTime = formData.get('manualTime');
    
    if (!manualDate || !manualTime) {
        showMessage('❌ Tarih ve saat alanları doldurulmalıdır', 'error');
        return;
    }
    
    const setBtn = document.getElementById('setDateTimeBtn');
    const btnText = setBtn.querySelector('.btn-text');
    const btnLoader = setBtn.querySelector('.btn-loader');
    
    // Loading state
    setBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoader.style.display = 'inline-block';
    
    try {
        console.log('📤 DateTime ayarlanıyor:', manualDate, manualTime);
        
        const params = new URLSearchParams();
        params.append('manualDate', manualDate);
        params.append('manualTime', manualTime);
        
        const response = await secureFetch('/api/datetime/set', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });
        
        if (response && response.ok) {
            const data = await response.json();
            
            if (data.success) {
                showMessage('✅ Tarih-saat başarıyla ayarlandı', 'success');
                console.log('✅ DateTime ayarlandı:', data);
                
                // Formu temizle ve durumu güncelle
                resetDateTimeForm();
                setTimeout(() => {
                    loadDateTimeStatus();
                }, 1000);
            } else {
                showMessage('❌ ' + (data.message || 'Tarih-saat ayarlanamadı'), 'error');
                console.error('DateTime set başarısız:', data);
            }
        } else {
            const errorText = await response.text();
            console.error('Sunucu hatası detayı:', errorText);
            showMessage('❌ Sunucu hatası: ' + (errorText || 'Bilinmeyen hata'), 'error');
        }
    } catch (error) {
        console.error('DateTime set hatası:', error);
        showMessage('❌ Tarih-saat ayarlanırken hata oluştu', 'error');
    } finally {
        // Reset loading state
        setBtn.disabled = false;
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
    }
}

// Şimdiki zamanı form alanlarına doldur
function setCurrentDateTime() {
    const now = new Date();
    
    // Tarih formatı: YYYY-MM-DD
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    // Saat formatı: HH:MM:SS
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}:${seconds}`;
    
    // Form alanlarını doldur
    document.getElementById('manualDate').value = dateStr;
    document.getElementById('manualTime').value = timeStr;
    
    showMessage('✅ Şimdiki tarih ve saat form alanlarına yerleştirildi', 'info');
    console.log('🕐 Form alanları dolduruldu:', dateStr, timeStr);
}

// Formu temizle
function resetDateTimeForm() {
    const form = document.getElementById('datetimeForm');
    
    if (form) {
        form.reset();
    }
    
    showMessage('✅ Form temizlendi', 'info');
}

// HTML escape helper
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

    // System Info Sayfası - YENİ
    function initSystemInfoPage() {
        const updateSystemInfo = async () => {
            try {
                const response = await secureFetch('/api/system-info');
                if (response && response.ok) {
                    const data = await response.json();
                    
                    // Hardware bilgileri
                    updateElement('chipModel', data.hardware.chip);
                    updateElement('coreCount', data.hardware.cores);
                    updateElement('cpuFreq', data.hardware.frequency + ' MHz');
                    updateElement('chipRevision', data.hardware.revision);
                    updateElement('flashSize', formatBytes(data.hardware.flashSize));
                    
                    // Memory bilgileri
                    updateElement('totalHeap', formatBytes(data.memory.totalHeap));
                    updateElement('usedHeap', formatBytes(data.memory.usedHeap));
                    updateElement('freeHeap', formatBytes(data.memory.freeHeap));
                    updateElement('minFreeHeap', formatBytes(data.memory.minFreeHeap));
                    
                    const usagePercent = Math.round((data.memory.usedHeap / data.memory.totalHeap) * 100);
                    updateElement('ramUsageBar', '', usagePercent);
                    updateElement('ramUsagePercent', usagePercent + '%');
                    document.getElementById('ramUsageBar').style.width = usagePercent + '%';
                    
                    // Software bilgileri
                    updateElement('firmwareVersion', 'v' + data.software.version);
                    updateElement('sdkVersion', data.software.sdk);
                    updateElement('buildDate', data.software.buildDate);
                    updateElement('uptime', formatUptime(data.software.uptime));
                    
                    // UART istatistikleri
                    updateElement('uartTxCount', data.uart.txCount);
                    updateElement('uartRxCount', data.uart.rxCount);
                    updateElement('uartErrorCount', data.uart.errors);
                    updateElement('uartSuccessRate', data.uart.successRate.toFixed(1) + '%');
                    updateElement('currentBaud', data.uart.baudRate);
                    
                    // Dosya sistemi
                    updateElement('totalSpace', formatBytes(data.filesystem.total));
                    updateElement('usedSpace', formatBytes(data.filesystem.used));
                    updateElement('freeSpace', formatBytes(data.filesystem.free));
                }
            } catch (error) {
                console.error('System info hatası:', error);
                showMessage('Sistem bilgileri alınamadı', 'error');
            }
        };

        updateSystemInfo();
        state.pollingIntervals.systemInfo = setInterval(updateSystemInfo, 10000);

        // Yenile butonu
        document.getElementById('refreshBtn')?.addEventListener('click', updateSystemInfo);

        // Yeniden başlat butonu
        document.getElementById('rebootBtn')?.addEventListener('click', async () => {
            if (confirm('Sistemi yeniden başlatmak istediğinize emin misiniz?')) {
                const response = await secureFetch('/api/system/reboot', { method: 'POST' });
                if (response && response.ok) {
                    showMessage('Sistem yeniden başlatılıyor...', 'warning');
                    setTimeout(() => {
                        window.location.href = '/';
                    }, 3000);
                }
            }
        });
    }

    // Hesap Ayarları
    function initAccountPage() {
        const form = document.getElementById('accountForm');
        if (!form) return;

        secureFetch('/api/settings').then(r => r && r.json()).then(settings => {
            if (settings) {
                form.querySelector('#deviceName').value = settings.deviceName || '';
                form.querySelector('#tmName').value = settings.tmName || '';
                form.querySelector('#username').value = settings.username || '';
            }
        }).catch(error => {
            console.error('Ayarlar yüklenemedi:', error);
            showMessage('Ayarlar yüklenemedi', 'error');
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const response = await secureFetch('/api/settings', {
                    method: 'POST',
                    body: new URLSearchParams(new FormData(form))
                });
                showMessage(response && response.ok ? 'Ayarlar başarıyla kaydedildi.' : 'Ayarlar kaydedilirken bir hata oluştu.', response && response.ok ? 'success' : 'error');
            } catch (error) {
                console.error('Ayar kayıt hatası:', error);
                showMessage('Bir hata oluştu', 'error');
            }
        });
    }

    // NTP Ayarları
    // Global fonksiyon - window nesnesine ekle ki HTML'den çağrılabilsin
window.moveToNext = function(input, nextPart, isSecondary = false) {
    const value = input.value;
    
    // Sadece sayı girişine izin ver ve temizle
    const numericValue = value.replace(/[^0-9]/g, '');
    input.value = numericValue;
    
    // 255'i aşmasını engelle
    if (parseInt(numericValue) > 255) {
        input.value = '255';
    }
    
    // Otomatik geçiş koşulları
    const shouldMoveNext = (input.value.length === 3) || 
                          (input.value === '255') || 
                          (input.value.length === 2 && parseInt(input.value) > 25);
    
    if (shouldMoveNext && nextPart <= 4) {
        const nextInput = getNextIPInput(input, nextPart, isSecondary);
        if (nextInput) {
            setTimeout(() => {
                nextInput.focus();
                nextInput.select();
            }, 10);
        }
    }
    
    // Hidden input'u güncelle
    updateHiddenIPInput(isSecondary);
    
    // Container'ı validate et
    validateIPContainer(input.closest('.ip-input-container'));
};

function getNextIPInput(currentInput, nextPart, isSecondary) {
    if (isSecondary) {
        return document.getElementById(`ntp2-part${nextPart}`);
    } else {
        const container = currentInput.closest('.ip-input-container');
        return container ? container.querySelector(`.ip-part[data-part="${nextPart}"]`) : null;
    }
}

function getPrevIPInput(currentInput, currentPart, isSecondary) {
    if (currentPart <= 1) return null;
    
    if (isSecondary) {
        return document.getElementById(`ntp2-part${currentPart - 1}`);
    } else {
        const container = currentInput.closest('.ip-input-container');
        return container ? container.querySelector(`.ip-part[data-part="${currentPart - 1}"]`) : null;
    }
}

function updateHiddenIPInput(isSecondary = false) {
    const hiddenId = isSecondary ? 'ntpServer2' : 'ntpServer1';
    const hiddenInput = document.getElementById(hiddenId);
    
    if (!hiddenInput) return;
    
    let parts = [];
    
    if (isSecondary) {
        // İkincil NTP için ID'leri kullan
        for (let i = 1; i <= 4; i++) {
            const input = document.getElementById(`ntp2-part${i}`);
            const value = input ? (input.value || '0') : '0';
            parts.push(value);
        }
    } else {
        // Birincil NTP için container'dan seç
        const container = document.querySelector('.ip-input-container:not(:has(#ntp2-part1))');
        if (container) {
            const inputs = container.querySelectorAll('.ip-part');
            inputs.forEach(input => {
                const value = input.value || '0';
                parts.push(value);
            });
        } else {
            parts = ['0', '0', '0', '0'];
        }
    }
    
    const ip = parts.join('.');
    hiddenInput.value = ip;
    
    console.log(`${isSecondary ? 'NTP2' : 'NTP1'} güncellendi:`, ip);
}

function validateIPContainer(container) {
    if (!container) return false;
    
    const inputs = container.querySelectorAll('.ip-part');
    let isValid = true;
    let isEmpty = true;
    
    inputs.forEach(input => {
        const value = input.value.trim();
        if (value !== '' && value !== '0') {
            isEmpty = false;
        }
        
        if (value !== '') {
            const num = parseInt(value);
            if (isNaN(num) || num < 0 || num > 255) {
                isValid = false;
            }
        }
    });
    
    // CSS class'larını güncelle
    container.classList.remove('valid', 'invalid', 'empty');
    
    if (isEmpty) {
        container.classList.add('empty');
        return false;
    } else if (isValid) {
        container.classList.add('valid');
        return true;
    } else {
        container.classList.add('invalid');
        return false;
    }
}

function validateIPFormat(ip) {
    if (!ip || ip.trim() === '' || ip === '0.0.0.0') return false;
    
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    
    return parts.every(part => {
        const num = parseInt(part);
        return !isNaN(num) && num >= 0 && num <= 255 && part === num.toString();
    });
}

function validateNTPForm() {
    const ntp1 = document.getElementById('ntpServer1').value;
    const ntp2 = document.getElementById('ntpServer2').value;
    
    console.log('NTP Form Validation:', { ntp1, ntp2 });
    
    // Birincil NTP zorunlu kontrol
    if (!validateIPFormat(ntp1)) {
        showMessage('Lütfen geçerli bir birincil NTP IP adresi girin. Örnek: 192.168.1.1', 'error');
        
        // İlk container'a focus et
        const firstContainer = document.querySelector('.ip-input-container:not(:has(#ntp2-part1))');
        if (firstContainer) {
            const firstInput = firstContainer.querySelector('.ip-part');
            if (firstInput) firstInput.focus();
            firstContainer.classList.add('invalid');
        }
        return false;
    }
    
    // İkincil NTP opsiyonel ama girilmişse geçerli olmalı
    if (ntp2 && ntp2 !== '0.0.0.0' && !validateIPFormat(ntp2)) {
        showMessage('İkincil NTP IP adresi geçersiz. Boş bırakabilir veya geçerli IP girebilirsiniz.', 'error');
        
        // İkinci container'a focus et
        const secondContainer = document.querySelector('.ip-input-container:has(#ntp2-part1)');
        if (secondContainer) {
            const firstInput = secondContainer.querySelector('.ip-part');
            if (firstInput) firstInput.focus();
            secondContainer.classList.add('invalid');
        }
        return false;
    }
    
    return true;
}

function loadCurrentNTPToInputs(server1, server2) {
    console.log('NTP değerleri yükleniyor:', { server1, server2 });
    
    // Birincil NTP yükle
    if (server1 && validateIPFormat(server1)) {
        const parts = server1.split('.');
        const container = document.querySelector('.ip-input-container:not(:has(#ntp2-part1))');
        if (container) {
            const inputs = container.querySelectorAll('.ip-part');
            parts.forEach((part, index) => {
                if (inputs[index]) {
                    inputs[index].value = part;
                }
            });
            updateHiddenIPInput(false);
            validateIPContainer(container);
        }
    }
    
    // İkincil NTP yükle
    if (server2 && validateIPFormat(server2)) {
        const parts = server2.split('.');
        for (let i = 1; i <= 4; i++) {
            const input = document.getElementById(`ntp2-part${i}`);
            if (input && parts[i-1]) {
                input.value = parts[i-1];
            }
        }
        updateHiddenIPInput(true);
        const container2 = document.querySelector('.ip-input-container:has(#ntp2-part1)');
        validateIPContainer(container2);
    }
}

function setupIPInputKeyboardHandlers() {
    document.addEventListener('keydown', function(e) {
        if (!e.target.classList.contains('ip-part')) return;
        
        const currentInput = e.target;
        const currentPart = parseInt(currentInput.dataset.part);
        const isSecondary = currentInput.id && currentInput.id.startsWith('ntp2-');
        
        switch(e.key) {
            case 'Backspace':
                if (currentInput.value === '' && currentInput.selectionStart === 0) {
                    e.preventDefault();
                    const prevInput = getPrevIPInput(currentInput, currentPart, isSecondary);
                    if (prevInput) {
                        prevInput.focus();
                        prevInput.setSelectionRange(prevInput.value.length, prevInput.value.length);
                    }
                }
                break;
                
            case 'ArrowLeft':
                if (currentInput.selectionStart === 0) {
                    e.preventDefault();
                    const prevInput = getPrevIPInput(currentInput, currentPart, isSecondary);
                    if (prevInput) {
                        prevInput.focus();
                        prevInput.setSelectionRange(prevInput.value.length, prevInput.value.length);
                    }
                }
                break;
                
            case 'ArrowRight':
                if (currentInput.selectionStart === currentInput.value.length) {
                    e.preventDefault();
                    const nextInput = getNextIPInput(currentInput, currentPart + 1, isSecondary);
                    if (nextInput) {
                        nextInput.focus();
                        nextInput.setSelectionRange(0, 0);
                    }
                }
                break;
                
            case '.':
            case 'Period':
                e.preventDefault();
                const nextInput = getNextIPInput(currentInput, currentPart + 1, isSecondary);
                if (nextInput) {
                    nextInput.focus();
                    nextInput.select();
                }
                break;
                
            case 'Tab':
                // Tab normal davranışını korur, müdahale etme
                break;
                
            default:
                // Sadece sayısal girişe izin ver
                if (!/[0-9]/.test(e.key) && 
                    !['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) &&
                    !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                }
        }
    });
    
    // Input change olayları
    document.addEventListener('input', function(e) {
        if (e.target.classList.contains('ip-part')) {
            const isSecondary = e.target.id && e.target.id.startsWith('ntp2-');
            
            // Değeri güncelle
            setTimeout(() => {
                updateHiddenIPInput(isSecondary);
                validateIPContainer(e.target.closest('.ip-input-container'));
            }, 10);
        }
    });
}

function addPresetServerButtons() {
    const form = document.getElementById('ntpForm');
    if (!form) return;
    
    const firstSection = form.querySelector('.settings-section');
    if (!firstSection || firstSection.querySelector('.preset-servers')) return; // Zaten eklenmişse çık
    
    const presetHTML = `
        <div class="preset-servers">
            <h4>🚀 Hızlı NTP Sunucu Seçenekleri</h4>
            <div class="preset-buttons">
                <button type="button" class="preset-btn" data-ip="192.168.1.1" title="Yerel Router/Modem">
                    🏠 Router (192.168.1.1)
                </button>
                <button type="button" class="preset-btn" data-ip="8.8.8.8" title="Google Public DNS">
                    🌐 Google (8.8.8.8)
                </button>
                <button type="button" class="preset-btn" data-ip="1.1.1.1" title="Cloudflare DNS">
                    ⚡ Cloudflare (1.1.1.1)
                </button>
                <button type="button" class="preset-btn" data-ip="208.67.222.222" title="OpenDNS">
                    🔒 OpenDNS (208.67.222.222)
                </button>
            </div>
        </div>
    `;
    
    firstSection.insertAdjacentHTML('beforeend', presetHTML);
    
    // Event listener'ları ekle
    form.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const ip = this.dataset.ip;
            const parts = ip.split('.');
            
            // Birincil NTP'ye yükle
            const container = document.querySelector('.ip-input-container:not(:has(#ntp2-part1))');
            if (container) {
                const inputs = container.querySelectorAll('.ip-part');
                parts.forEach((part, index) => {
                    if (inputs[index]) {
                        inputs[index].value = part;
                        
                        // Güzel bir animasyon efekti
                        inputs[index].style.background = 'rgba(72, 187, 120, 0.3)';
                        setTimeout(() => {
                            inputs[index].style.background = '';
                        }, 500);
                    }
                });
                
                updateHiddenIPInput(false);
                validateIPContainer(container);
                
                showMessage(`✅ Birincil NTP sunucu: ${ip} seçildi`, 'success');
            }
        });
    });
}

// İyileştirilmiş initNtpPage fonksiyonu
function initNtpPage() {
    const form = document.getElementById('ntpForm');
    if (!form) {
        console.warn('NTP form bulunamadı');
        return;
    }
    
    console.log('NTP sayfası başlatılıyor...');
    
    // Klavye handler'larını kur
    setupIPInputKeyboardHandlers();
    
    // Preset butonları ekle
    setTimeout(() => addPresetServerButtons(), 100);
    
    // Mevcut ayarları yükle
    secureFetch('/api/ntp')
        .then(r => r && r.json())
        .then(ntp => {
            if (ntp) {
                console.log('Mevcut NTP ayarları:', ntp);
                
                updateElement('currentServer1', ntp.ntpServer1 || 'Belirtilmemiş');
                updateElement('currentServer2', ntp.ntpServer2 || 'Belirtilmemiş');
                updateElement('lastUpdate', new Date().toLocaleTimeString());
                
                // IP inputlarına yükle
                setTimeout(() => {
                    loadCurrentNTPToInputs(ntp.ntpServer1, ntp.ntpServer2);
                }, 200);
            }
        })
        .catch(error => {
            console.error('NTP ayarları yüklenemedi:', error);
            showMessage('NTP ayarları yüklenirken hata oluştu', 'error');
        });

    // Form gönderim handler'ı
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        console.log('NTP formu gönderiliyor...');
        
        // Validation
        if (!validateNTPForm()) {
            return;
        }
        
        const saveBtn = document.getElementById('saveNtpBtn');
        const btnText = saveBtn.querySelector('.btn-text');
        const btnLoader = saveBtn.querySelector('.btn-loader');
        
        // Loading state
        saveBtn.disabled = true;
        btnText.style.display = 'none';
        btnLoader.style.display = 'inline-block';
        
        const formData = new FormData(form);
        const server1 = formData.get('ntpServer1');
        const server2 = formData.get('ntpServer2');
        
        console.log('Gönderilecek NTP ayarları:', { server1, server2 });
        
        try {
            const response = await secureFetch('/api/ntp', {
                method: 'POST',
                body: new URLSearchParams(formData)
            });
            
            if (response && response.ok) {
                showMessage('✅ NTP ayarları başarıyla dsPIC33EP\'ye gönderildi', 'success');
                
                // Mevcut değerleri göster
                updateElement('currentServer1', server1);
                updateElement('currentServer2', server2 || 'Belirtilmemiş');
                updateElement('lastUpdate', new Date().toLocaleTimeString());
                
            } else {
                const errorText = await response.text();
                showMessage('❌ NTP ayarları gönderilemedi: ' + errorText, 'error');
            }
        } catch (error) {
            console.error('NTP API hatası:', error);
            showMessage('⚠️ Sunucu ile iletişim kurulamadı', 'error');
        } finally {
            // Reset loading state
            saveBtn.disabled = false;
            btnText.style.display = 'inline';
            btnLoader.style.display = 'none';
        }
    });
    
    // Sayfa yüklendiğinde hidden input'ları başlat
    setTimeout(() => {
        updateHiddenIPInput(false);
        updateHiddenIPInput(true);
    }, 300);
    
    console.log('✅ NTP sayfası hazır');
}
    
// BaudRate Ayarları - GÜNCELLENMİŞ VERSİYON (Test butonu kaldırıldı)
function initBaudRatePage() {
    console.log("⚙️ BaudRate sayfası başlatılıyor...");
    
    const form = document.getElementById('baudrateForm');
    const checkBaudBtn = document.getElementById('checkBaudBtn');
    const saveBaudBtn = document.getElementById('saveBaudBtn');
    
    if (!form) {
        console.error('BaudRate form bulunamadı!');
        return;
    }

    // Son güncelleme zamanını güncelle
    function updateLastUpdateTime() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('tr-TR');
        updateElement('lastUpdate', timeStr);
    }

    // Mevcut baudrate'i sorgula
    async function checkCurrentBaudRate() {
        if (!checkBaudBtn) return;
        
        const btnText = checkBaudBtn.querySelector('.btn-text');
        const btnLoader = checkBaudBtn.querySelector('.btn-loader');
        
        try {
            // Loading state
            checkBaudBtn.disabled = true;
            if (btnText) btnText.style.display = 'none';
            if (btnLoader) btnLoader.style.display = 'inline-block';
            
            showMessage('Mevcut baudrate sorgulanıyor...', 'info');
            
            const response = await secureFetch('/api/baudrate/current');
            
            if (response && response.ok) {
                const data = await response.json();
                
                if (data.success && data.currentBaudRate > 0) {
                    updateElement('currentBaudRate', data.currentBaudRate + ' bps');
                    
                    // Radio butonunu seç
                    const radio = document.querySelector(`input[name="baud"][value="${data.currentBaudRate}"]`);
                    if (radio) {
                        radio.checked = true;
                    }
                    
                    showMessage(`Mevcut baudrate: ${data.currentBaudRate} bps`, 'success');
                } else {
                    updateElement('currentBaudRate', 'Alınamadı');
                    showMessage(data.message || 'Baudrate bilgisi alınamadı', 'error');
                }
            } else {
                updateElement('currentBaudRate', 'Hata');
                showMessage('Sunucu hatası', 'error');
            }
            
            updateLastUpdateTime();
            
        } catch (error) {
            console.error('Baudrate sorgulama hatası:', error);
            showMessage('Baudrate sorgulama hatası: ' + error.message, 'error');
            updateElement('currentBaudRate', 'Hata');
        } finally {
            // Reset loading state
            if (checkBaudBtn) checkBaudBtn.disabled = false;
            if (btnText) btnText.style.display = 'inline';
            if (btnLoader) btnLoader.style.display = 'none';
        }
    }

// BaudRate değiştir
    async function changeBaudRate(event) {
        event.preventDefault();
        
        const selectedBaud = document.querySelector('input[name="baud"]:checked');
        if (!selectedBaud) {
            showMessage('Lütfen bir baudrate seçin', 'error');
            return;
        }
        
        const btnText = saveBaudBtn?.querySelector('.btn-text');
        const btnLoader = saveBaudBtn?.querySelector('.btn-loader');
        
        try {
            // Loading state
            if (saveBaudBtn) saveBaudBtn.disabled = true;
            if (btnText) btnText.style.display = 'none';
            if (btnLoader) btnLoader.style.display = 'inline-block';
            
            showMessage(`BaudRate ${selectedBaud.value} bps olarak değiştiriliyor...`, 'info');
            
            const formData = new URLSearchParams();
            formData.append('baud', selectedBaud.value);
            
            const response = await secureFetch('/api/baudrate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: formData
            });
            
            if (response && response.ok) {
                const data = await response.json();
                
                if (data.success) {
                    showMessage(`✅ BaudRate başarıyla ${data.newBaudRate} bps olarak değiştirildi`, 'success');
                    updateElement('currentBaudRate', data.newBaudRate + ' bps');
                    
                    // 2 saniye sonra otomatik kontrol
                    setTimeout(() => {
                        showMessage('Yeni ayar kontrol ediliyor...', 'info');
                        checkCurrentBaudRate();
                    }, 2000);
                } else {
                    showMessage(data.error || 'BaudRate değiştirilemedi', 'error');
                }
            } else {
                const errorText = response ? await response.text() : 'Bağlantı hatası';
                showMessage('BaudRate değiştirilemedi: ' + errorText, 'error');
            }
            
        } catch (error) {
            console.error('BaudRate değiştirme hatası:', error);
            showMessage('BaudRate değiştirme hatası: ' + error.message, 'error');
        } finally {
            // Reset loading state
            if (saveBaudBtn) saveBaudBtn.disabled = false;
            if (btnText) btnText.style.display = 'inline';
            if (btnLoader) btnLoader.style.display = 'none';
        }
    }

    // Event listener'ları ekle
    if (checkBaudBtn) {
        checkBaudBtn.addEventListener('click', checkCurrentBaudRate);
    }
    
    if (form) {
        form.addEventListener('submit', changeBaudRate);
    }

    // Sayfa yüklendiğinde son güncelleme zamanını göster
    updateLastUpdateTime();
    
    // İsteğe bağlı: Sayfa yüklendiğinde otomatik sorgulama yapma
    checkCurrentBaudRate();
    
    console.log('✅ BaudRate sayfası hazır');
}

// Arıza Kayıtları Sayfası - Toplu Sorgulama Versiyonu
function initFaultPage() {
    console.log("🛠️ Arıza Kayıtları sayfası başlatılıyor (Toplu sorgulama)...");
    
    const fetchAllFaultsBtn = document.getElementById('fetchAllFaultsBtn');
    const refreshFaultBtn = document.getElementById('refreshFaultBtn');
    const exportCSVBtn = document.getElementById('exportCSVBtn');
    const exportExcelBtn = document.getElementById('exportExcelBtn');
    const clearFaultBtn = document.getElementById('clearFaultBtn');
    const filterPinType = document.getElementById('filterPinType');
    const faultTableBody = document.getElementById('faultTableBody');
    const manualTestForm = document.getElementById('manualTestForm');
    
    if (!fetchAllFaultsBtn || !faultTableBody) {
        console.error("Fault page elementleri bulunamadı!");
        return;
    }
    
    let faultRecords = [];
    let filteredRecords = [];
    let isLoading = false;
    
    // Ham arıza verisini parse et
    function parseFaultData(rawData) {
        console.log("Parse ediliyor:", rawData);
        
        const data = rawData.trim();
        
        // Arıza numarasını ayır
        let recordNumber = 0;
        let faultData = data;
        
        if (data.includes(':')) {
            const parts = data.split(':');
            recordNumber = parseInt(parts[0]);
            faultData = parts[1];
        }
        
        if (faultData.length < 22) {
            console.error("Çok kısa veri:", faultData);
            return null;
        }
        
        try {
            // Pin numarası - HEX olarak parse et
            const pinHex = faultData.substring(0, 2);
            const pinNumber = parseInt(pinHex, 16);// 16 tabanında parse et

            // "0A" = 10 (decimal)
            console.log(`Pin hex: ${pinHex} → decimal: ${pinNumber}`);
            
            let pinType, pinName, displayPinNumber;
            
            // Pin tipi belirleme - GİRİŞ pinleri 9-16 arasında
            if (pinNumber >= 1 && pinNumber <= 8) {
            pinType = "Çıkış";
            pinName = "Çıkış " + pinNumber;
            displayPinNumber = pinNumber;
            } else if (pinNumber >= 9 && pinNumber <= 16) {
            pinType = "Giriş";
            // 9-16 aralığını 1-8 olarak göster
            const adjustedPinNumber = pinNumber - 8;
            pinName = "Giriş " + adjustedPinNumber;
            displayPinNumber = adjustedPinNumber;
        } else {
        pinType = "Bilinmeyen";
        pinName = "Pin " + pinNumber;
        displayPinNumber = pinNumber;
        }
            
            // Tarih-saat - DECIMAL olarak parse et
            const year = 2000 + parseInt(faultData.substring(2, 4), 10);
            const month = parseInt(faultData.substring(4, 6), 10);
            const day = parseInt(faultData.substring(6, 8), 10);
            const hour = parseInt(faultData.substring(8, 10), 10);
            const minute = parseInt(faultData.substring(10, 12), 10);
            const second = parseInt(faultData.substring(12, 14), 10);
            
            console.log("Tarih:", {year, month, day, hour, minute, second});
            
            // Tarih doğrulama
            if (month < 1 || month > 12 || day < 1 || day > 31 || 
                hour > 23 || minute > 59 || second > 59) {
                console.error("Geçersiz tarih-saat!");
                return null;
            }
            
            const dateTime = `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year} ` +
                            `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`;
            
            // Milisaniye - DECIMAL olarak parse et
            let millisecond = 0;
            if (faultData.length >= 17) {
                millisecond = parseInt(faultData.substring(14, 17), 10);
                console.log(`Milisaniye: ${millisecond} ms`);
            }
            
            // Süre - DECIMAL olarak parse et
            let duration = "0.000 sn";
            let durationSeconds = 0;
            
            if (faultData.length >= 22) {
                const durationStr = faultData.substring(17, 22);
                const seconds = parseInt(durationStr.substring(0, 2), 10);
                const ms = parseInt(durationStr.substring(2, 5), 10);
                durationSeconds = seconds + (ms / 1000.0);
                
                console.log(`Süre: ${seconds}.${ms} = ${durationSeconds} saniye`);
                
                if (durationSeconds < 1.0) {
                    duration = Math.round(durationSeconds * 1000) + " ms";
                } else if (durationSeconds < 60.0) {
                    duration = durationSeconds.toFixed(3) + " sn";
                } else {
                    const mins = Math.floor(durationSeconds / 60);
                    const secs = durationSeconds % 60;
                    duration = mins + "dk " + secs.toFixed(1) + "sn";
                }
            }
            
            return {
                recordNumber,
                pinNumber: displayPinNumber, // Görüntülenecek pin numarası
                actualPinNumber: pinNumber,  // Gerçek pin numarası (9-16)
                pinType,
                pinName,
                dateTime,
                duration,
                durationSeconds,
                millisecond,
                rawData: data
            };
            
        } catch (error) {
            console.error("Parse hatası:", error);
            return null;
        }
    }
    
    // Arıza kaydı ekleme - GÜNCELLEME
    function addFaultToTable(fault, index, faultNo) {
    const row = document.createElement('tr');
    row.className = 'fault-row new-row';
    
    const pinBadgeClass = fault.pinType === 'Çıkış' ? 'output' : 'input';
    const dateTimeWithMs = `${fault.dateTime}.${fault.millisecond}`;
    
    // Tabloda gösterilecek sıra numarası
    // En üstteki en yeni (en büyük faultNo) olacak şekilde
    const displayOrder = faultNo;
    
    row.innerHTML = `
        <td class="text-center">${displayOrder}</td>
        <td class="text-center"><span class="fault-number-badge">${faultNo.toString().padStart(5, '0')}</span></td>
        <td class="text-center">${fault.pinNumber}</td>
        <td><span class="pin-badge ${pinBadgeClass}">${fault.pinType}</span></td>
        <td class="datetime-cell">${dateTimeWithMs}</td>
        <td class="duration-cell">${fault.duration}</td>
        <td class="raw-data-cell" title="${fault.rawData}">${fault.rawData}</td>
    `;
    
    return row;
    }
    
// Tablo güncellemeyi de optimize et (Virtual scrolling eklenebilir)
function updateTable() {
    const filterType = filterPinType ? filterPinType.value : 'all';
    filteredRecords = filterType === 'all' ? 
        [...faultRecords] : 
        faultRecords.filter(record => record.pinType === filterType);
    
    // Virtual DOM kullan veya sadece görünür kayıtları render et
    const visibleCount = Math.min(filteredRecords.length, 100); // İlk 100 kaydı göster
    
    faultTableBody.innerHTML = '';
    
    if (filteredRecords.length === 0) {
        faultTableBody.innerHTML = `
            <tr class="empty-row">
                <td colspan="7" class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <h4>Arıza kaydı bulunamadı</h4>
                </td>
            </tr>
        `;
        return;
    }
    
    // DocumentFragment kullan (performans için)
    const fragment = document.createDocumentFragment();
    
    for (let i = 0; i < visibleCount; i++) {
        const record = filteredRecords[i];
        const row = addFaultToTable(record, i, record.faultNo);
        fragment.appendChild(row);
    }
    
    faultTableBody.appendChild(fragment);
    
    // Eğer daha fazla kayıt varsa bilgi göster
    if (filteredRecords.length > visibleCount) {
        const infoRow = document.createElement('tr');
        infoRow.innerHTML = `
            <td colspan="7" class="text-center" style="background: var(--bg-secondary); padding: 1rem;">
                📊 ${visibleCount} / ${filteredRecords.length} kayıt gösteriliyor
                <button onclick="showAllRecords()" class="btn secondary small" style="margin-left: 1rem;">
                    Tümünü Göster
                </button>
            </td>
        `;
        faultTableBody.appendChild(infoRow);
    }
    
    updateElement('totalFaults', faultRecords.length.toString());
}
    
    // Progress bar güncelleme
    function updateProgress(current, total) {
        const percent = Math.round((current / total) * 100);
        
        updateElement('progressCurrent', current.toString());
        updateElement('progressTotal', total.toString());
        updateElement('progressPercent', percent + '%');
        
        const progressBar = document.getElementById('progressBar');
        if (progressBar) {
            progressBar.style.width = percent + '%';
        }
    }
    
// AN komutuyla arıza sayısını al
async function getFaultCount() {
    try {
        console.log("📊 Arıza sayısı sorgulanıyor (AN komutu)...");
        
        const formData = new URLSearchParams();
        formData.append('command', 'AN');
        
        const response = await secureFetch('/api/uart/send', {
            method: 'POST',
            body: formData
        });
        
        if (response && response.ok) {
            const data = await response.json();
            
            if (data.success && data.response) {
                const responseText = data.response.trim();
                console.log(`📥 Gelen yanıt: ${responseText}`);
                
                // "A00050" formatını kontrol et
                if (responseText.startsWith('A') && responseText.length >= 5) {
                    // İlk A'dan sonraki tüm sayıları al
                    const numberStr = responseText.substring(1); // "00050"
                    const count = parseInt(numberStr, 10); // 50
                    const actualFaultCount = count - 1; // 49
                    
                    console.log(`✅ Sistem arıza sayısı: ${actualFaultCount}`);
                    updateElement('systemFaultCount', actualFaultCount.toString());
                    return actualFaultCount;
                }
            }
        }
        
        console.error("❌ Arıza sayısı alınamadı");
        return 0;
        
    } catch (error) {
        console.error("Arıza sayısı sorgu hatası:", error);
        return 0;
    }
}
    
    // Tek arıza alma fonksiyonunu da optimize et
async function getSingleFault(faultNo, timeout = 1000) { // Timeout'u düşür
    try {
        const command = faultNo.toString().padStart(5, '0') + 'v';
        console.log(`📥 Arıza ${faultNo} sorgulanıyor: ${command}`);
        
        const formData = new URLSearchParams();
        formData.append('command', command);
        
        // AbortController ile timeout yönetimi
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch('/api/uart/send', {
            method: 'POST',
            body: formData,
            signal: controller.signal,
            headers: {
                'Authorization': `Bearer ${state.token}`
            }
        });
        
        clearTimeout(timeoutId);
        
        if (response && response.ok) {
            const data = await response.json();
            
            if (data.success && data.response && data.response.length > 10) {
                const parsedFault = parseFaultData(data.response);
                
                if (parsedFault) {
                    parsedFault.faultNo = faultNo;
                    return parsedFault;
                }
            }
        }
        
        return null;
        
    } catch (error) {
        if (error.name === 'AbortError') {
            console.warn(`⏱️ Arıza ${faultNo} timeout`);
        } else {
            console.error(`Arıza ${faultNo} alınamadı:`, error);
        }
        return null;
    }
}
    
    // Tüm arızaları toplu al
    async function fetchAllFaults() {
    if (isLoading) return;
    isLoading = true;
    
    const btnText = fetchAllFaultsBtn.querySelector('.btn-text');
    const btnIcon = fetchAllFaultsBtn.querySelector('.btn-icon');
    const btnLoader = fetchAllFaultsBtn.querySelector('.btn-loader');
    const progressSection = document.getElementById('progressSection');
    
    // UI'ı loading durumuna al
    fetchAllFaultsBtn.disabled = true;
    btnIcon.style.display = 'none';
    btnLoader.style.display = 'inline-block';
    btnText.textContent = 'Sorgulanıyor...';
    
    // Kayıtları sıfırla
    faultRecords = [];
    updateTable();
    
    try {
        // 1. Önce AN komutuyla toplam arıza sayısını al
        updateElement('progressText', 'Arıza sayısı sorgulanıyor...');
        progressSection.style.display = 'block';
        
        const totalCount = await getFaultCount();
        
        if (totalCount === 0) {
            showMessage('❌ Sistemde arıza kaydı bulunamadı', 'warning');
            progressSection.style.display = 'none';
            return;
        }
        
        showMessage(`✅ Sistemde ${totalCount} adet arıza bulundu. Kayıtlar alınıyor...`, 'info');
        
        // Progress bar'ı başlat
        updateProgress(0, totalCount);
        updateElement('progressText', `${totalCount} adet arıza kaydı alınıyor...`);
        
        // 2. PERFORMANS İYİLEŞTİRMELERİ
        let successCount = 0;
        let failCount = 0;
        let consecutiveErrors = 0;
        const MAX_CONSECUTIVE_ERRORS = 5;
        
        // Batch processing parametreleri
        const BATCH_SIZE = 50;  // Her seferde 50 kayıt al
        const BATCH_DELAY = 200; // Batch'ler arası bekleme (ms)
        const ITEM_DELAY = 10;   // Kayıtlar arası minimum bekleme (100ms yerine 10ms!)
        const UPDATE_FREQUENCY = 50; // Her 50 kayıtta bir güncelle
        
        // Paralel istek desteği (ESP32'nin kaldırabileceği kadar)
        const MAX_PARALLEL = 3;
        let activeRequests = 0;
        
        // İstek kuyruğu oluştur
        const requestQueue = [];
        for (let i = totalCount; i >= 1; i--) {
            requestQueue.push(i);
        }
        
        // Paralel istek işleyici
        async function processFault(faultNo) {
            const progressIndex = totalCount - faultNo + 1;
            
            try {
                activeRequests++;
                const fault = await getSingleFault(faultNo);
                
                if (fault) {
                    faultRecords.push(fault);
                    successCount++;
                    consecutiveErrors = 0;
                    
                    // Daha seyrek güncelle
                    if (successCount % UPDATE_FREQUENCY === 0 || progressIndex === totalCount) {
                        updateTable();
                        updateProgress(progressIndex, totalCount);
                        updateElement('progressText', `Arıza ${progressIndex}/${totalCount} alınıyor... (${Math.round(progressIndex/totalCount*100)}%)`);
                    }
                    
                    console.log(`✅ [${progressIndex}/${totalCount}] Arıza ${faultNo} alındı`);
                } else {
                    failCount++;
                    consecutiveErrors++;
                    console.warn(`⚠️ Arıza ${faultNo} alınamadı`);
                    
                    // Çok fazla ardışık hata varsa dur
                    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                        throw new Error('Çok fazla ardışık hata. İşlem durduruluyor.');
                    }
                }
            } finally {
                activeRequests--;
            }
        }
        
        // Ana işlem döngüsü
        while (requestQueue.length > 0) {
            // Batch oluştur
            const batch = [];
            for (let i = 0; i < BATCH_SIZE && requestQueue.length > 0; i++) {
                batch.push(requestQueue.shift());
            }
            
            // Batch'i işle (paralel)
            const batchPromises = [];
            for (const faultNo of batch) {
                // Maksimum paralel istek kontrolü
                while (activeRequests >= MAX_PARALLEL) {
                    await new Promise(resolve => setTimeout(resolve, 5));
                }
                
                // İstek başlat (await etmeden)
                batchPromises.push(processFault(faultNo));
                
                // Kayıtlar arası minimum bekleme
                if (batch.indexOf(faultNo) < batch.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, ITEM_DELAY));
                }
            }
            
            // Batch tamamlanmasını bekle
            await Promise.all(batchPromises);
            
            // Progress güncelle
            const completed = totalCount - requestQueue.length;
            updateProgress(completed, totalCount);
            updateElement('progressText', `İşleniyor: ${completed}/${totalCount} (${Math.round(completed/totalCount*100)}%)`);
            
            // Batch'ler arası bekleme (ESP32'yi zorlamayalım)
            if (requestQueue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
            }
        }
        
        // İşlem tamamlandı
        updateProgress(totalCount, totalCount);
        updateElement('progressText', `İşlem tamamlandı!`);
        
        // Son tabloyu güncelle
        updateTable();
        updateElement('lastQuery', new Date().toLocaleTimeString());
        
        // Özet mesajı
        const elapsedTime = Math.round((Date.now() - startTime) / 1000);
        const avgSpeed = Math.round(successCount / elapsedTime * 60); // dakikada kayıt
        
        const summaryMsg = `✅ ${successCount} kayıt ${elapsedTime} saniyede alındı` + 
                          ` (Hız: ~${avgSpeed} kayıt/dk)` +
                          (failCount > 0 ? ` - ${failCount} başarısız` : '');
        showMessage(summaryMsg, 'success');
        
        // 3 saniye sonra progress'i gizle
        setTimeout(() => {
            progressSection.style.display = 'none';
        }, 3000);
        
    } catch (error) {
        console.error('Toplu arıza sorgulama hatası:', error);
        showMessage('❌ ' + error.message, 'error');
        progressSection.style.display = 'none';
        
    } finally {
        // UI'ı normale döndür
        isLoading = false;
        fetchAllFaultsBtn.disabled = false;
        btnIcon.style.display = 'inline';
        btnLoader.style.display = 'none';
        btnIcon.textContent = '📥';
        btnText.textContent = 'Arıza Kayıtlarını İste';
    }
}
    
    // Event listener'lar
    
    // Tüm arızaları al butonu
    fetchAllFaultsBtn.addEventListener('click', fetchAllFaults);
    
    // Yenile butonu
    if (refreshFaultBtn) {
        refreshFaultBtn.addEventListener('click', () => {
            updateTable();
            showMessage('✅ Tablo yenilendi', 'info');
        });
    }
    
    // Temizle butonu
    if (clearFaultBtn) {
        clearFaultBtn.addEventListener('click', () => {
            if (faultRecords.length === 0) {
                showMessage('Temizlenecek kayıt yok', 'warning');
                return;
            }
            
            if (confirm(`${faultRecords.length} adet arıza kaydını tablodan temizlemek istediğinizden emin misiniz?`)) {
                faultRecords = [];
                updateTable();
                updateElement('systemFaultCount', '-');
                showMessage('✅ Tablo temizlendi', 'success');
            }
        });
    }
    
    // Filtre değişimi
    if (filterPinType) {
        filterPinType.addEventListener('change', updateTable);
    }
    
    // CSV Export
    if (exportCSVBtn) {
        exportCSVBtn.addEventListener('click', () => {
            if (faultRecords.length === 0) {
                showMessage('❌ Dışa aktarılacak arıza kaydı bulunamadı', 'warning');
                return;
            }
            
            exportFaultsAsCSV(filteredRecords.length > 0 ? filteredRecords : faultRecords);
        });
    }
    
    // Excel Export
    if (exportExcelBtn) {
        exportExcelBtn.addEventListener('click', () => {
            if (faultRecords.length === 0) {
                showMessage('❌ Dışa aktarılacak arıza kaydı bulunamadı', 'warning');
                return;
            }
            
            exportFaultsAsExcel(filteredRecords.length > 0 ? filteredRecords : faultRecords);
        });
    }
    
    // Manuel test form handler
    if (manualTestForm) {
        // Hızlı komut butonları
        document.querySelectorAll('.quick-commands .btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const command = this.dataset.cmd;
                const commandInput = document.getElementById('manualCommand');
                if (commandInput) {
                    commandInput.value = command;
                    commandInput.focus();
                }
            });
        });
        
        // Manuel test form submit
        manualTestForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const command = document.getElementById('manualCommand').value.trim();
            if (!command) {
                showMessage('Komut boş olamaz', 'warning');
                return;
            }
            
            const submitBtn = this.querySelector('button[type="submit"]');
            const btnText = submitBtn.querySelector('.btn-text');
            const btnLoader = submitBtn.querySelector('.btn-loader');
            
            // Loading state
            submitBtn.disabled = true;
            btnText.style.display = 'none';
            btnLoader.style.display = 'inline-block';
            
            try {
                const formData = new URLSearchParams();
                formData.append('command', command);
                
                const response = await secureFetch('/api/uart/send', {
                    method: 'POST',
                    body: formData
                });
                
                if (response && response.ok) {
                    const data = await response.json();
                    showManualTestResult(data);
                } else {
                    showMessage('❌ Manuel test başarısız oldu', 'error');
                }
                
            } catch (error) {
                console.error('Manuel test hatası:', error);
                showMessage('❌ Manuel test sırasında hata oluştu', 'error');
            } finally {
                // Reset loading state
                submitBtn.disabled = false;
                btnText.style.display = 'inline';
                btnLoader.style.display = 'none';
            }
        });
        
        // Temizle butonu
        document.getElementById('clearManualTest')?.addEventListener('click', function() {
            document.getElementById('manualCommand').value = '';
            document.getElementById('manualTestResult').style.display = 'none';
            showMessage('Manuel test alanı temizlendi', 'info');
        });
    }
    
    // Manuel test sonucunu göster
    function showManualTestResult(data) {
        const resultDiv = document.getElementById('manualTestResult');
        const contentDiv = document.getElementById('manualTestContent');
        
        if (!resultDiv || !contentDiv) return;
        
        let resultHTML = `
            <div class="test-result-item">
                <strong>Gönderilen Komut:</strong>
                <code style="font-family: monospace; background: var(--bg-tertiary); padding: 2px 6px; border-radius: 3px;">${data.command}</code>
            </div>
            <div class="test-result-item">
                <strong>Durum:</strong>
                <span class="status-badge ${data.success ? 'active' : 'error'}">
                    ${data.success ? 'Başarılı' : 'Başarısız'}
                </span>
            </div>
            <div class="test-result-item">
                <strong>Yanıt Uzunluğu:</strong>
                <span>${data.responseLength} karakter</span>
            </div>
            <div class="test-result-item">
                <strong>Zaman:</strong>
                <span>${data.timestamp}</span>
            </div>
        `;
        
        if (data.responseLength > 0) {
            resultHTML += `
                <div class="test-result-item" style="flex-direction: column; align-items: flex-start;">
                    <strong style="margin-bottom: 0.5rem;">dsPIC Yanıtı:</strong>
                    <div class="test-result-response" style="
                        background: var(--bg-tertiary); 
                        padding: 0.5rem; 
                        border-radius: 4px; 
                        font-family: monospace; 
                        font-size: 0.875rem;
                        word-break: break-all;
                        width: 100%;">
                        ${escapeHtml(data.response)}
                    </div>
                </div>
            `;
        } else {
            resultHTML += `
                <div class="test-result-item">
                    <strong>dsPIC Yanıtı:</strong>
                    <span class="test-result-empty" style="color: var(--text-tertiary);">Yanıt alınamadı</span>
                </div>
            `;
        }
        
        contentDiv.innerHTML = resultHTML;
        resultDiv.style.display = 'block';
        resultDiv.scrollIntoView({ behavior: 'smooth' });
        
        showMessage(
            data.success ? 
            `✅ Komut başarılı: ${data.responseLength} karakter yanıt` : 
            '❌ Komut başarısız (timeout)', 
            data.success ? 'success' : 'error'
        );
    }
    
    // CSV Export fonksiyonu
    function exportFaultsAsCSV(records) {
        try {
            const BOM = '\uFEFF';
            let csvContent = 'sep=;\n';
            
            // Header
            csvContent += '"Sıra";"Arıza No";"Pin No";"Pin Tipi";"Pin Adı";"Tarih-Saat";"Arıza Süresi";"Süre (sn)";"Ham Veri"\n';
            
            // Data rows
            records.forEach((record, index) => {
                const dateTimeWithMs = `${record.dateTime}.${record.millisecond}`;
                const faultNo = record.faultNo ? record.faultNo.toString().padStart(5, '0') : (index + 1).toString().padStart(5, '0');
                
                const row = [
                    index + 1,
                    faultNo,
                    record.pinNumber,
                    record.pinType,
                    record.pinName,
                    dateTimeWithMs,
                    record.duration,
                    record.durationSeconds || 0,
                    record.rawData
                ];
                
                const escapedRow = row.map(field => {
                    const str = String(field).replace(/"/g, '""');
                    return `"${str}"`;
                });
                
                csvContent += escapedRow.join(';') + '\n';
            });
            
            const blob = new Blob([BOM + csvContent], { 
                type: 'text/csv;charset=utf-8' 
            });
            
            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10);
            const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
            const filename = `teias_eklim_faults_${dateStr}_${timeStr}.csv`;
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showMessage(`✅ ${records.length} arıza kaydı CSV olarak dışa aktarıldı`, 'success');
            
        } catch (error) {
            console.error('CSV export hatası:', error);
            showMessage('❌ CSV dışa aktarma sırasında hata oluştu', 'error');
        }
    }

// Excel Export fonksiyonu - GÜNCELLENMİŞ
function exportFaultsAsExcel(records) {
    try {
        let xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xmlContent += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n';
        xmlContent += ' xmlns:o="urn:schemas-microsoft-com:office:office"\n';
        xmlContent += ' xmlns:x="urn:schemas-microsoft-com:office:excel"\n';
        xmlContent += ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"\n';
        xmlContent += ' xmlns:html="https://www.w3.org/TR/REC-html40">\n';
        
        // Document Properties
        xmlContent += '<DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">\n';
        xmlContent += '<Title>TEİAŞ EKLİM Arıza Kayıtları</Title>\n';
        xmlContent += '<Author>TEİAŞ EKLİM Sistemi</Author>\n';
        xmlContent += '<Created>' + new Date().toISOString() + '</Created>\n';
        xmlContent += '<Company>TEİAŞ</Company>\n';
        xmlContent += '</DocumentProperties>\n';
        
        // Styles
        xmlContent += '<Styles>\n';
        xmlContent += '<Style ss:ID="Header">\n';
        xmlContent += '<Font ss:FontName="Calibri" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>\n';
        xmlContent += '<Interior ss:Color="#4F81BD" ss:Pattern="Solid"/>\n';
        xmlContent += '<Borders>\n';
        xmlContent += '<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>\n';
        xmlContent += '<Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>\n';
        xmlContent += '<Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>\n';
        xmlContent += '<Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>\n';
        xmlContent += '</Borders>\n';
        xmlContent += '</Style>\n';
        
        xmlContent += '<Style ss:ID="Output">\n';
        xmlContent += '<Font ss:FontName="Calibri" ss:Size="11" ss:Color="#006100"/>\n';
        xmlContent += '<Interior ss:Color="#C6EFCE" ss:Pattern="Solid"/>\n';
        xmlContent += '</Style>\n';
        
        xmlContent += '<Style ss:ID="Input">\n';
        xmlContent += '<Font ss:FontName="Calibri" ss:Size="11" ss:Color="#0F1494"/>\n';
        xmlContent += '<Interior ss:Color="#B7DEE8" ss:Pattern="Solid"/>\n';
        xmlContent += '</Style>\n';
        
        xmlContent += '</Styles>\n';
        
        // Worksheet
        xmlContent += '<Worksheet ss:Name="Arıza Kayıtları">\n';
        xmlContent += '<Table ss:ExpandedColumnCount="8" ss:ExpandedRowCount="' + (records.length + 1) + '" x:FullColumns="1" x:FullRows="1">\n';
        
        // Column definitions - Milisaniye sütunu kaldırıldı
        xmlContent += '<Column ss:AutoFitWidth="0" ss:Width="50"/>\n';   // Sıra
        xmlContent += '<Column ss:AutoFitWidth="0" ss:Width="60"/>\n';   // Pin No
        xmlContent += '<Column ss:AutoFitWidth="0" ss:Width="70"/>\n';   // Pin Tipi
        xmlContent += '<Column ss:AutoFitWidth="0" ss:Width="100"/>\n';  // Pin Adı
        xmlContent += '<Column ss:AutoFitWidth="0" ss:Width="160"/>\n';  // Tarih-Saat (genişletildi)
        xmlContent += '<Column ss:AutoFitWidth="0" ss:Width="100"/>\n';  // Arıza Süresi
        xmlContent += '<Column ss:AutoFitWidth="0" ss:Width="80"/>\n';   // Süre (sn)
        xmlContent += '<Column ss:AutoFitWidth="0" ss:Width="150"/>\n';  // Ham Veri
        
        // Header row
        xmlContent += '<Row ss:StyleID="Header">\n';
        xmlContent += '<Cell><Data ss:Type="String">Sıra</Data></Cell>\n';
        xmlContent += '<Cell><Data ss:Type="String">Pin No</Data></Cell>\n';
        xmlContent += '<Cell><Data ss:Type="String">Pin Tipi</Data></Cell>\n';
        xmlContent += '<Cell><Data ss:Type="String">Pin Adı</Data></Cell>\n';
        xmlContent += '<Cell><Data ss:Type="String">Tarih-Saat</Data></Cell>\n';
        xmlContent += '<Cell><Data ss:Type="String">Arıza Süresi</Data></Cell>\n';
        xmlContent += '<Cell><Data ss:Type="String">Süre (sn)</Data></Cell>\n';
        xmlContent += '<Cell><Data ss:Type="String">Ham Veri</Data></Cell>\n';
        xmlContent += '</Row>\n';
        
        // Data rows
        records.forEach((record, index) => {
            const styleID = record.pinType === 'Çıkış' ? 'Output' : 'Input';
            
            // Tarih-saat + milisaniye birleşik
            const dateTimeWithMs = `${record.dateTime}.${record.millisecond}`;
            
            xmlContent += `<Row ss:StyleID="${styleID}">\n`;
            xmlContent += `<Cell><Data ss:Type="Number">${index + 1}</Data></Cell>\n`;
            xmlContent += `<Cell><Data ss:Type="Number">${record.pinNumber}</Data></Cell>\n`;
            xmlContent += `<Cell><Data ss:Type="String">${escapeXml(record.pinType)}</Data></Cell>\n`;
            xmlContent += `<Cell><Data ss:Type="String">${escapeXml(record.pinName)}</Data></Cell>\n`;
            xmlContent += `<Cell><Data ss:Type="String">${escapeXml(dateTimeWithMs)}</Data></Cell>\n`;
            xmlContent += `<Cell><Data ss:Type="String">${escapeXml(record.duration)}</Data></Cell>\n`;
            xmlContent += `<Cell><Data ss:Type="Number">${record.durationSeconds || 0}</Data></Cell>\n`;
            xmlContent += `<Cell><Data ss:Type="String">${escapeXml(record.rawData)}</Data></Cell>\n`;
            xmlContent += '</Row>\n';
        });
        
        xmlContent += '</Table>\n';
        xmlContent += '</Worksheet>\n';
        xmlContent += '</Workbook>';
        
        // XML escape helper function
        function escapeXml(str) {
            if (!str) return '';
            return str.toString().replace(/[<>&'"]/g, function (c) {
                switch (c) {
                    case '<': return '&lt;';
                    case '>': return '&gt;';
                    case '&': return '&amp;';
                    case "'": return '&apos;';
                    case '"': return '&quot;';
                    default: return c;
                }
            });
        }
        
        // Create and download file
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + xmlContent], { 
            type: 'application/vnd.ms-excel;charset=utf-8' 
        });
        
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10);
        const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
        const filename = `teias_eklim_faults_${dateStr}_${timeStr}.xls`;
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showMessage(`✅ ${records.length} arıza kaydı renkli Excel formatında dışa aktarıldı`, 'success');
        
    } catch (error) {
        console.error('Excel export hatası:', error);
        showMessage('❌ Excel dışa aktarma sırasında hata oluştu', 'error');
    }
}

// Helper functions
    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    }
    
    function updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }
    
    // İlk yüklemede tabloyu boş göster
    updateTable();
    
    console.log('✅ Fault sayfası hazır (Toplu sorgulama versiyonu)');
}

// Log Kayıtları Sayfası - Otomatik Kaydırma KALDIRILMIŞ, Pagination DESTEKLİ
function initLogPage() {
    const logContainer = document.getElementById('logContainer');
    const pauseLogsBtn = document.getElementById('pauseLogsBtn');
    const exportLogsBtn = document.getElementById('exportLogsBtn');
    const exportExcelBtn = document.getElementById('exportExcelBtn');
    const refreshLogsBtn = document.getElementById('refreshLogsBtn');
    const clearLogsBtn = document.getElementById('clearLogsBtn');
    const autoRefreshToggle = document.getElementById('autoRefreshToggle');
    const refreshInterval = document.getElementById('refreshInterval');
    const logSearch = document.getElementById('logSearch');
    const logLevelFilter = document.getElementById('logLevelFilter');
    const logSourceFilter = document.getElementById('logSourceFilter');
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    
    if (!logContainer) {
        console.warn('Log container bulunamadı');
        return;
    }
    
    console.log('📋 Log sistemi başlatılıyor...');
    
    // Log verileri ve state
    let currentPage = 1;
    let totalPages = 1;
    let totalLogs = 0;
    let allLogs = [];
    let filteredLogs = [];
    let autoRefreshActive = true;
    let refreshIntervalId = null;
    
    // Mevcut filtreler
    const currentFilters = {
        search: '',
        level: 'all',
        source: 'all'
    };

    // Pagination kontrollerini oluştur
    function createPaginationControls() {
        let paginationContainer = document.getElementById('paginationControls');
        
        if (!paginationContainer) {
            const paginationHTML = `
                <div id="paginationControls" class="pagination-controls">
                    <div class="pagination-info">
                        <span id="pageInfo">Sayfa 1 / 1</span>
                        <span class="log-count">Toplam: <span id="totalLogCount">0</span> kayıt</span>
                    </div>
                    <div class="pagination-buttons">
                        <button id="firstPageBtn" class="btn small" disabled>
                            <span>⏮️ İlk</span>
                        </button>
                        <button id="prevPageBtn" class="btn small" disabled>
                            <span>◀️ Önceki</span>
                        </button>
                        <span id="pageNumbers" class="page-numbers"></span>
                        <button id="nextPageBtn" class="btn small" disabled>
                            <span>Sonraki ▶️</span>
                        </button>
                        <button id="lastPageBtn" class="btn small" disabled>
                            <span>Son ⏭️</span>
                        </button>
                    </div>
                </div>
            `;
            
            logContainer.insertAdjacentHTML('afterend', paginationHTML);
            setupPaginationEventListeners();
        }
        
        updatePaginationDisplay();
    }

    // Pagination event listener'ları
    function setupPaginationEventListeners() {
        document.getElementById('firstPageBtn')?.addEventListener('click', () => goToPage(1));
        document.getElementById('prevPageBtn')?.addEventListener('click', () => goToPage(currentPage - 1));
        document.getElementById('nextPageBtn')?.addEventListener('click', () => goToPage(currentPage + 1));
        document.getElementById('lastPageBtn')?.addEventListener('click', () => goToPage(totalPages));
    }

    // Sayfa numaralarını oluştur
    function generatePageNumbers() {
        const pageNumbersContainer = document.getElementById('pageNumbers');
        if (!pageNumbersContainer) return;
        
        pageNumbersContainer.innerHTML = '';
        
        const maxVisible = 5;
        let start = Math.max(1, currentPage - 2);
        let end = Math.min(totalPages, start + maxVisible - 1);
        
        if (end - start < maxVisible - 1) {
            start = Math.max(1, end - maxVisible + 1);
        }
        
        if (start > 1) {
            const dots = document.createElement('span');
            dots.className = 'page-dots';
            dots.textContent = '...';
            pageNumbersContainer.appendChild(dots);
        }
        
        for (let i = start; i <= end; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = `page-number-btn ${i === currentPage ? 'active' : ''}`;
            pageBtn.textContent = i;
            pageBtn.onclick = () => goToPage(i);
            pageNumbersContainer.appendChild(pageBtn);
        }
        
        if (end < totalPages) {
            const dots = document.createElement('span');
            dots.className = 'page-dots';
            dots.textContent = '...';
            pageNumbersContainer.appendChild(dots);
        }
    }

    // Pagination display güncelle
    function updatePaginationDisplay() {
        const pageInfo = document.getElementById('pageInfo');
        if (pageInfo) {
            pageInfo.textContent = `Sayfa ${currentPage} / ${totalPages}`;
        }
        
        const totalLogCountEl = document.getElementById('totalLogCount');
        if (totalLogCountEl) {
            totalLogCountEl.textContent = totalLogs;
        }
        
        const firstBtn = document.getElementById('firstPageBtn');
        const prevBtn = document.getElementById('prevPageBtn');
        const nextBtn = document.getElementById('nextPageBtn');
        const lastBtn = document.getElementById('lastPageBtn');
        
        if (firstBtn) firstBtn.disabled = currentPage <= 1;
        if (prevBtn) prevBtn.disabled = currentPage <= 1;
        if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
        if (lastBtn) lastBtn.disabled = currentPage >= totalPages;
        
        generatePageNumbers();
    }

    // Belirli sayfaya git
    function goToPage(pageNumber) {
        if (pageNumber < 1 || pageNumber > totalPages || pageNumber === currentPage) {
            return;
        }
        
        currentPage = pageNumber;
        fetchLogs();
    }

    // Logları ekranda göster
    function renderLogs() {
        if (!logContainer) return;
        
        logContainer.innerHTML = '';
        
        if (filteredLogs.length === 0 && totalLogs === 0) {
            logContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📋</div>
                    <h4>Log kaydı bulunamadı</h4>
                    <p>Henüz log kaydı yok. Sistem çalıştıkça loglar burada görünecek.</p>
                </div>
            `;
            return;
        } else if (filteredLogs.length === 0 && currentFilters.search) {
            logContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <h4>Arama sonucu bulunamadı</h4>
                    <p>Aradığınız kriterlere uygun log bulunamadı.</p>
                    <button class="btn secondary small" onclick="clearAllFilters()">🧹 Filtreleri Temizle</button>
                </div>
            `;
            return;
        }

        const fragment = document.createDocumentFragment();
        
        filteredLogs.forEach(log => {
            const logEntry = document.createElement('div');
            logEntry.className = `log-entry log-${log.l.toLowerCase()}`;
            
            let highlightedMessage = log.m;
            if (currentFilters.search) {
                const regex = new RegExp(`(${escapeRegExp(currentFilters.search)})`, 'gi');
                highlightedMessage = log.m.replace(regex, '<mark>$1</mark>');
            }
            
            logEntry.innerHTML = `
                <span class="log-time">${log.t}</span>
                <span class="log-level level-${log.l.toLowerCase()}">${log.l}</span>
                <span class="log-source">${log.s}</span>
                <span class="log-message">${highlightedMessage}</span>
            `;
            
            fragment.appendChild(logEntry);
        });
        
        logContainer.appendChild(fragment);
    }

    // İstatistikleri güncelle
    function updateLogStats() {
        updateElement('totalLogs', totalLogs.toString());
        updateElement('lastLogUpdate', new Date().toLocaleTimeString());
    }

    // Filtre badge güncelle
    function updateFilterBadges() {
        let activeFilterCount = 0;
        
        if (currentFilters.search) activeFilterCount++;
        if (currentFilters.level !== 'all') activeFilterCount++;
        if (currentFilters.source !== 'all') activeFilterCount++;
        
        if (clearFiltersBtn) {
            clearFiltersBtn.textContent = activeFilterCount > 0 ? 
                `🧹 Filtreleri Temizle (${activeFilterCount})` : 
                '🧹 Filtreleri Temizle';
            clearFiltersBtn.style.display = activeFilterCount > 0 ? 'block' : 'none';
        }
    }

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Logları API'den çek
    async function fetchLogs() {
        if (state.logPaused) {
            console.log('Log yenileme duraklatıldı');
            return;
        }
        
        try {
            const params = new URLSearchParams({
                page: currentPage,
                level: currentFilters.level,
                source: currentFilters.source,
                search: currentFilters.search
            });
            
            const response = await secureFetch(`/api/logs?${params}`);
            if (response && response.ok) {
                const data = await response.json();
                
                currentPage = data.currentPage || 1;
                totalPages = data.totalPages || 1;
                totalLogs = data.totalLogs || 0;
                
                allLogs = data.logs || [];
                filteredLogs = allLogs;
                
                if (data.stats) {
                    updateElement('errorCount', data.stats.errorCount.toString());
                    updateElement('warningCount', data.stats.warnCount.toString());
                }
                
                updateSourceFilter();
                renderLogs();
                updateLogStats();
                updatePaginationDisplay();
                
                console.log(`✅ Sayfa ${currentPage}/${totalPages} - ${allLogs.length} log`);
            }
        } catch (error) {
            console.error('Log yükleme hatası:', error);
            showMessage('Log kayıtları yüklenemedi', 'error');
        }
    }

    // Kaynak filtresi güncelle
    function updateSourceFilter() {
        if (!logSourceFilter) return;
        
        const currentValue = logSourceFilter.value;
        const sources = new Set(['all']);
        
        allLogs.forEach(log => sources.add(log.s));
        
        logSourceFilter.innerHTML = '<option value="all">Tümü</option>';
        Array.from(sources).sort().forEach(source => {
            if (source !== 'all') {
                const option = document.createElement('option');
                option.value = source;
                option.textContent = source;
                if (source === currentValue) option.selected = true;
                logSourceFilter.appendChild(option);
            }
        });
    }

    // Yenileme interval ayarla
    function setRefreshInterval(interval) {
        if (refreshIntervalId) {
            clearInterval(refreshIntervalId);
        }
        
        if (autoRefreshActive && interval > 0) {
            refreshIntervalId = setInterval(() => {
                if (currentPage === 1 && !state.logPaused) {
                    fetchLogs();
                }
            }, interval);
            console.log(`⏱️ Otomatik yenileme: ${interval/1000}s`);
        }
    }

    // Global clear fonksiyonu
    window.clearAllFilters = function() {
        if (logSearch) logSearch.value = '';
        if (logLevelFilter) logLevelFilter.value = 'all';
        if (logSourceFilter) logSourceFilter.value = 'all';
        
        currentFilters.search = '';
        currentFilters.level = 'all';
        currentFilters.source = 'all';
        
        currentPage = 1;
        fetchLogs();
        showMessage('✅ Filtreler temizlendi', 'info');
    };

    // EVENT LISTENERS

    // Arama
    if (logSearch) {
        let searchTimeout;
        logSearch.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                currentFilters.search = e.target.value.trim();
                currentPage = 1;
                fetchLogs();
            }, 300);
        });
    }

    // Seviye filtresi
    if (logLevelFilter) {
        logLevelFilter.addEventListener('change', (e) => {
            currentFilters.level = e.target.value;
            currentPage = 1;
            fetchLogs();
        });
    }

    // Kaynak filtresi
    if (logSourceFilter) {
        logSourceFilter.addEventListener('change', (e) => {
            currentFilters.source = e.target.value;
            currentPage = 1;
            fetchLogs();
        });
    }

    // Temizle filtreleri
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', window.clearAllFilters);
    }

    // Yenile butonu
    if (refreshLogsBtn) {
        refreshLogsBtn.addEventListener('click', () => {
            console.log('🔄 Manuel yenileme');
            fetchLogs();
        });
    }

    // Duraklat butonu
    if (pauseLogsBtn) {
        pauseLogsBtn.addEventListener('click', () => {
            state.logPaused = !state.logPaused;
            
            const btnIcon = pauseLogsBtn.querySelector('.btn-icon');
            const btnText = pauseLogsBtn.querySelector('.btn-text');
            
            if (state.logPaused) {
                btnIcon.textContent = '▶️';
                btnText.textContent = 'Devam Et';
                pauseLogsBtn.classList.add('paused');
                showMessage('⏸️ Log akışı duraklatıldı', 'info');
            } else {
                btnIcon.textContent = '⏸️';
                btnText.textContent = 'Duraklat';
                pauseLogsBtn.classList.remove('paused');
                showMessage('▶️ Log akışı devam ediyor', 'info');
                fetchLogs();
            }
        });
    }

    // TEMİZLE BUTONU - GERÇEKTEN SİLER
    if (clearLogsBtn) {
        clearLogsBtn.addEventListener('click', async () => {
            const confirmMsg = `⚠️ DİKKAT!\n\n${totalLogs} adet log kaydı KALICI olarak silinecek.\n\nBu işlem GERİ ALINAMAZ!\n\nDevam etmek istiyor musunuz?`;
            
            if (!confirm(confirmMsg)) return;
            if (!confirm("Son kez soruyorum: Emin misiniz?")) return;
            
            try {
                showMessage('🗑️ Loglar temizleniyor...', 'info');
                
                const response = await secureFetch('/api/logs/clear', { method: 'POST' });
                if (response && response.ok) {
                    const result = await response.json();
                    
                    allLogs = [];
                    filteredLogs = [];
                    currentPage = 1;
                    totalPages = 1;
                    totalLogs = 0;
                    
                    logContainer.innerHTML = `
                        <div class="empty-state">
                            <div class="empty-icon">✨</div>
                            <h4>Hafıza Temizlendi</h4>
                            <p>${result.previousCount} log kaydı kalıcı olarak silindi.</p>
                        </div>
                    `;
                    
                    updateLogStats();
                    updateFilterBadges();
                    updatePaginationDisplay();
                    
                    showMessage(`✅ ${result.previousCount} log hafızadan temizlendi`, 'success');
                    
                    setTimeout(() => {
                        fetchLogs();
                    }, 2000);
                } else {
                    showMessage('❌ Temizleme başarısız', 'error');
                }
            } catch (error) {
                console.error('Temizleme hatası:', error);
                showMessage('❌ Temizleme hatası', 'error');
            }
        });
    }

    // Export CSV
    if (exportLogsBtn) {
        exportLogsBtn.addEventListener('click', async () => {
            if (totalLogs === 0) {
                showMessage('⚠️ Dışa aktarılacak log yok', 'warning');
                return;
            }
            
            try {
                showMessage('📥 Loglar hazırlanıyor...', 'info');
                
                const allPagesLogs = [];
                for (let page = 1; page <= totalPages; page++) {
                    const params = new URLSearchParams({ page: page });
                    const response = await secureFetch(`/api/logs?${params}`);
                    if (response && response.ok) {
                        const data = await response.json();
                        allPagesLogs.push(...(data.logs || []));
                    }
                }
                
                const BOM = '\uFEFF';
                let csvContent = 'sep=;\n';
                csvContent += '"Zaman";"Seviye";"Kaynak";"Mesaj"\n';
                
                allPagesLogs.forEach(log => {
                    const cleanMessage = log.m.replace(/"/g, '""').replace(/[\r\n\t]/g, ' ').trim();
                    csvContent += `"${log.t}";"${log.l}";"${log.s}";"${cleanMessage}"\n`;
                });
                
                const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' });
                const now = new Date();
                const filename = `logs_${now.toISOString().slice(0, 10)}_${now.toTimeString().slice(0, 5).replace(':', '')}.csv`;
                
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                showMessage(`✅ ${allPagesLogs.length} log CSV olarak indirildi`, 'success');
                
            } catch (error) {
                console.error('Export hatası:', error);
                showMessage('❌ Export hatası', 'error');
            }
        });
    }

    // Export Excel
    if (exportExcelBtn) {
        exportExcelBtn.addEventListener('click', async () => {
            if (totalLogs === 0) {
                showMessage('⚠️ Dışa aktarılacak log yok', 'warning');
                return;
            }
            
            try {
                showMessage('📊 Excel hazırlanıyor...', 'info');
                
                const allPagesLogs = [];
                for (let page = 1; page <= totalPages; page++) {
                    const params = new URLSearchParams({ page: page });
                    const response = await secureFetch(`/api/logs?${params}`);
                    if (response && response.ok) {
                        const data = await response.json();
                        allPagesLogs.push(...(data.logs || []));
                    }
                }
                
                // Excel XML format
                let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
                xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n';
                xml += ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n';
                xml += '<Worksheet ss:Name="Logs">\n<Table>\n';
                
                // Header
                xml += '<Row>\n';
                xml += '<Cell><Data ss:Type="String">Zaman</Data></Cell>\n';
                xml += '<Cell><Data ss:Type="String">Seviye</Data></Cell>\n';
                xml += '<Cell><Data ss:Type="String">Kaynak</Data></Cell>\n';
                xml += '<Cell><Data ss:Type="String">Mesaj</Data></Cell>\n';
                xml += '</Row>\n';
                
                // Data
                allPagesLogs.forEach(log => {
                    xml += '<Row>\n';
                    xml += `<Cell><Data ss:Type="String">${escapeXml(log.t)}</Data></Cell>\n`;
                    xml += `<Cell><Data ss:Type="String">${escapeXml(log.l)}</Data></Cell>\n`;
                    xml += `<Cell><Data ss:Type="String">${escapeXml(log.s)}</Data></Cell>\n`;
                    xml += `<Cell><Data ss:Type="String">${escapeXml(log.m)}</Data></Cell>\n`;
                    xml += '</Row>\n';
                });
                
                xml += '</Table>\n</Worksheet>\n</Workbook>';
                
                function escapeXml(str) {
                    return str.replace(/[<>&'"]/g, c => {
                        switch(c) {
                            case '<': return '&lt;';
                            case '>': return '&gt;';
                            case '&': return '&amp;';
                            case "'": return '&apos;';
                            case '"': return '&quot;';
                        }
                    });
                }
                
                const blob = new Blob(['\uFEFF' + xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
                const now = new Date();
                const filename = `logs_${now.toISOString().slice(0, 10)}.xls`;
                
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                showMessage(`✅ ${allPagesLogs.length} log Excel olarak indirildi`, 'success');
                
            } catch (error) {
                console.error('Excel export hatası:', error);
                showMessage('❌ Excel export hatası', 'error');
            }
        });
    }

    // Otomatik yenileme toggle
    if (autoRefreshToggle) {
        autoRefreshToggle.addEventListener('click', () => {
            autoRefreshActive = !autoRefreshActive;
            
            autoRefreshToggle.setAttribute('data-active', autoRefreshActive.toString());
            autoRefreshToggle.classList.toggle('active', autoRefreshActive);
            
            const toggleIcon = autoRefreshToggle.querySelector('.toggle-icon');
            const toggleText = autoRefreshToggle.querySelector('.toggle-text');
            
            if (autoRefreshActive) {
                toggleIcon.textContent = '🔄';
                toggleText.textContent = 'Otomatik Yenileme';
                showMessage('🔄 Otomatik yenileme açık', 'info');
                
                const interval = parseInt(refreshInterval?.value || '5000');
                setRefreshInterval(interval);
            } else {
                toggleIcon.textContent = '⏸️';
                toggleText.textContent = 'Manuel Yenileme';
                showMessage('⏸️ Otomatik yenileme kapalı', 'info');
                
                setRefreshInterval(0);
            }
        });
    }

    // Yenileme aralığı
    if (refreshInterval) {
        refreshInterval.addEventListener('change', () => {
            if (autoRefreshActive) {
                const interval = parseInt(refreshInterval.value);
                setRefreshInterval(interval);
                
                const text = refreshInterval.options[refreshInterval.selectedIndex].text;
                showMessage(`⏱️ Yenileme: ${text}`, 'info');
            }
        });
    }

    // Helper function
    function updateElement(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    // BAŞLATMA
    
    // Pagination oluştur
    createPaginationControls();
    
    // İlk yükleme
    fetchLogs();
    
    // Otomatik yenileme
    const initialInterval = parseInt(refreshInterval?.value || '5000');
    setRefreshInterval(initialInterval);
    
    // Cleanup
    window.addEventListener('beforeunload', () => {
        if (refreshIntervalId) {
            clearInterval(refreshIntervalId);
        }
    });
    
    console.log('✅ Log sistemi hazır (Pagination destekli, otomatik kaydırma yok)');
}

// Yedekleme Sayfası
function initBackupPage() {
    // Download butonu için event listener ekle
    const downloadBtn = document.getElementById('downloadBackupBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadBackup);
    }
    
    // Upload form event listener
    document.getElementById('uploadBackupForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('backupFile');
        if (fileInput.files.length === 0) {
            showMessage('Lütfen bir yedek dosyası seçin.', 'warning');
            return;
        }
        const formData = new FormData();
        formData.append('backup', fileInput.files[0]);
        
        showMessage('Yedek yükleniyor, lütfen bekleyin. Cihaz işlem sonrası yeniden başlatılacak.', 'info');

        try {
            const response = await secureFetch('/api/backup/upload', {
                method: 'POST',
                body: formData
            });

            if(response && response.ok){
                showMessage('Yedek başarıyla yüklendi! Cihaz 3 saniye içinde yeniden başlatılıyor...', 'success');
                setTimeout(() => window.location.href = '/', 3000);
            } else {
                showMessage('Yedek yükleme başarısız oldu. Dosyanın geçerli olduğundan emin olun.', 'error');
            }
        } catch (error) {
            console.error('Backup yükleme hatası:', error);
            showMessage('Bir hata oluştu', 'error');
        }
    });
}

// Yedek indirme fonksiyonu (global olarak tanımlanmalı - window nesnesine ekle)
window.downloadBackup = async function downloadBackup() {
    try {
        const response = await secureFetch('/api/backup/download');
        
        if (response && response.ok) {
            // Blob olarak indirme
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `teias_eklim_backup_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            showMessage('Yedek dosyası indiriliyor...', 'success');
        } else {
            showMessage('Yedek indirme yetkisi yok veya bir hata oluştu', 'error');
        }
    } catch (error) {
        console.error('Backup indirme hatası:', error);
        showMessage('Yedek indirilirken bir hata oluştu', 'error');
    }
}

    // --- 3. SAYFA YÖNLENDİRİCİ (ROUTER) İÇİN SAYFA LİSTESİ ---
    const pages = {
        dashboard: { file: 'pages/dashboard.html', init: initDashboardPage },
        network: { file: 'pages/network.html', init: initNetworkPage },
        ntp: { file: 'pages/ntp.html', init: initNtpPage },
        baudrate: { file: 'pages/baudrate.html', init: initBaudRatePage },
        fault: { file: 'pages/fault.html', init: initFaultPage },
        log: { file: 'pages/log.html', init: initLogPage },
        datetime: { file: 'pages/datetime.html', init: initDateTimePage }, // YENİ EKLENDİ
        systeminfo: { file: 'pages/systeminfo.html', init: initSystemInfoPage },
        account: { file: 'pages/account.html', init: initAccountPage },
        backup: { file: 'pages/backup.html', init: initBackupPage }
    };

    // --- 4. TEMEL FONKSİYONLAR (Router, Auth, API Fetch) ---

    function logout() {
        Object.values(state.pollingIntervals).forEach(clearInterval);
        localStorage.removeItem('sessionToken');
        window.location.href = '/login.html';
    }

    async function secureFetch(url, options = {}) {
        if (!state.token) {
            logout();
            return null;
        }
        const headers = { ...options.headers, 'Authorization': `Bearer ${state.token}` };
        if (options.body instanceof FormData) {
             delete headers['Content-Type'];
        }

        try {
            const response = await fetch(url, { ...options, headers });
            if (response.status === 401) {
                logout();
                return null;
            }
            return response;
        } catch (error) {
            console.error('API İsteği Hatası:', error);
            updateElement('currentDateTime', 'Bağlantı Hatası');
            return null;
        }
    }

    async function loadPage(pageName) {
        Object.values(state.pollingIntervals).forEach(clearInterval);

        const page = pages[pageName] || pages['dashboard'];
        const mainContent = document.getElementById('main-content');
        mainContent.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>Yükleniyor...</p></div>';

        try {
            const response = await secureFetch(`/${page.file}`);
            if (response && response.ok) {
                mainContent.innerHTML = await response.text();
                document.querySelectorAll('.nav-item').forEach(link => {
                    link.classList.toggle('active', link.dataset.page === pageName);
                });
                if (page.init) {
                    try {
                        page.init();
                    } catch(e) {
                        console.error("Sayfa başlatma hatası:", e);
                        mainContent.innerHTML = `<div class="error">Sayfa başlatılırken bir hata oluştu.</div>`;
                    }
                }
                // Bildirim sayısını güncelle
                updateNotificationCount();
            } else {
                mainContent.innerHTML = `<div class="error">Sayfa yüklenemedi (Hata: ${response ? response.status : 'Ağ Hatası'})</div>`;
            }
        } catch (error) {
            console.error('Sayfa yükleme hatası:', error);
            mainContent.innerHTML = `<div class="error">Sayfa yüklenirken bir hata oluştu.</div>`;
        }
    }

    function router() {
        const pageName = window.location.hash.substring(1) || 'dashboard';
        loadPage(pageName);
    }

    // --- 5. YARDIMCI UI FONKSİYONLARI ---
    
    function appendLog(logData) {
        const logContainer = document.getElementById('logContainer');
        if (!logContainer) return;

        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${logData.l.toLowerCase()}`;
        logEntry.innerHTML = `
            <span class="log-time">${logData.t}</span>
            <span class="log-level">${logData.l}</span>
            <span class="log-source">${logData.s}</span>
            <span class="log-message">${logData.m}</span>`;
        logContainer.appendChild(logEntry);
        if (state.autoScroll) logContainer.scrollTop = logContainer.scrollHeight;
    }

    function updateDashboardUI(data) {
        updateElement('currentDateTime', data.datetime);
        const ethStatusEl = document.getElementById('ethernetStatus');
        if(ethStatusEl) ethStatusEl.innerHTML = `<span class="status-indicator ${data.ethernetStatus ? 'active' : 'error'}"></span> ${data.ethernetStatus ? 'Bağlı' : 'Yok'}`;
        const timeStatusEl = document.getElementById('ntpStatus');
        if(timeStatusEl) timeStatusEl.innerHTML = `<span class="status-indicator ${data.timeSynced ? 'active' : 'warning'}"></span> ${data.timeSynced ? 'Senkronize' : 'Bekleniyor'}`;
        
        updateElement('deviceName', data.deviceName);
        updateElement('tmName', data.tmName);
        updateElement('deviceIP', data.deviceIP);
        updateElement('uptime', data.uptime);
        
        const memoryUsage = document.getElementById('memoryUsage');
        if(memoryUsage && data.freeHeap && data.totalHeap) {
            const usagePercent = Math.round(((data.totalHeap - data.freeHeap) / data.totalHeap) * 100);
            const progressBar = memoryUsage.querySelector('.progress-fill');
            const percentText = memoryUsage.querySelector('span:last-child');
            if(progressBar) progressBar.style.width = `${usagePercent}%`;
            if(percentText) percentText.textContent = `${usagePercent}%`;
        }
    }

    function updateElement(id, value, width = null) {
        const element = document.getElementById(id);
        if (element) {
            if (width !== null) {
                element.style.width = width + '%';
            } else {
                element.textContent = value;
            }
        }
    }

function showMessage(text, type = 'info', duration = 4000) {
    // Önce normal container'ı dene
    let container = document.getElementById('message-container');
    
    // Eğer yoksa, body'nin sonuna ekle
    if (!container) {
        container = document.createElement('div');
        container.id = 'message-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            max-width: 400px;
        `;
        document.body.appendChild(container);
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.style.cssText = `
        padding: 12px 20px;
        margin-bottom: 10px;
        border-radius: 8px;
        animation: slideInRight 0.3s ease-out;
        background: ${type === 'error' ? '#f56565' : type === 'success' ? '#48bb78' : type === 'warning' ? '#ed8936' : '#4299e1'};
        color: white;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;
    messageDiv.textContent = text;
    
    container.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 300);
    }, duration);
    
    console.log(`[${type.toUpperCase()}] ${text}`);
}

    // Notification sistemi
    async function updateNotificationCount() {
        try {
            const response = await secureFetch('/api/notifications');
            if (response && response.ok) {
                const data = await response.json();
                const badge = document.getElementById('notificationCount');
                if (badge) {
                    badge.textContent = data.count;
                    badge.style.display = data.count > 0 ? 'block' : 'none';
                }
            }
        } catch (error) {
            console.error('Bildirim hatası:', error);
        }
    }

    // Yardımcı formatters
    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (days > 0) {
            return `${days}g ${hours}s ${minutes}d`;
        } else if (hours > 0) {
            return `${hours}s ${minutes}d ${secs}s`;
        } else {
            return `${minutes}d ${secs}s`;
        }
    }

    // --- 6. UYGULAMA BAŞLATMA ---
    function main() {
        // Login veya parola değiştirme sayfasındaysak ana scripti çalıştırma
        if (window.location.pathname.includes('login.html') || window.location.pathname.includes('password_change.html')) {
            return; 
        }

        // Token yoksa login sayfasına yönlendir
        if (!state.token) {
            logout();
            return;
        }
        
        // Device info'yu al ve mDNS adresini göster
        fetch('/api/device-info')
            .then(r => r.json())
            .then(data => {
                updateElement('mdnsAddress', data.mdns || 'teias-eklim.local');
            })
            .catch(() => {
                updateElement('mdnsAddress', 'teias-eklim.local');
            });
        
        // Çıkış butonu
        document.getElementById('logoutBtn')?.addEventListener('click', (e) => { 
            e.preventDefault(); 
            logout(); 
        });
        
        // Navigasyon menüsü
        document.querySelectorAll('.nav-item').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.hash = link.dataset.page;
            });
        });
        
        // Notification butonu
        document.getElementById('notificationBtn')?.addEventListener('click', async () => {
            const response = await secureFetch('/api/notifications');
            if (response && response.ok) {
                const data = await response.json();
                console.log('Bildirimler:', data);
                // TODO: Bildirim popup'ı göster
            }
        });
        
        // Bildirim güncelleme timer'ı
        setInterval(updateNotificationCount, 30000); // 30 saniyede bir
        
        // Router'ı dinle ve ilk sayfayı yükle
        window.addEventListener('hashchange', router);
        router();
    }

    main();
});