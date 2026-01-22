#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <WiFiClientSecure.h>
#include <time.h>

// --- SECRET CONFIGURATION ---
#include "secrets.h"

// --- HARDWARE CONFIGURATION ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 32
#define OLED_RESET    -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

#define DHTPIN 4
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

// CORRECTED: Digital LDR module uses digital output
#define LDR_PIN 34    // Digital output from LDR module
#define PIR_PIN 13    // Motion Sensor

// Timing variables
unsigned long lastUpdate = 0;
const unsigned long UPDATE_INTERVAL = 3000; // 3 seconds
const unsigned long WIFI_TIMEOUT = 15000; // 15 seconds timeout

// NTP Server
const char* ntpServer = "pool.ntp.org";
const long  gmtOffset_sec = 0;
const int   daylightOffset_sec = 0;

// Status flags
bool wifiConnected = false;
bool lastSendSuccess = false;

void setup() {
  Serial.begin(115200);
  delay(1000); // Give serial monitor time to connect
  
  Serial.println("\n\n========================");
  Serial.println("ESP32 Sensor Node v2.0");
  Serial.println("========================");
  
  // Initialize sensors
  dht.begin();
  pinMode(LDR_PIN, INPUT_PULLUP); // Digital input with pull-up
  pinMode(PIR_PIN, INPUT);
  
  // Initialize OLED
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED initialization failed!");
    Serial.println("Check I2C connections:");
    Serial.println("- SDA -> GPIO 21");
    Serial.println("- SCL -> GPIO 22");
    Serial.println("- VCC -> 3.3V");
    Serial.println("- GND -> GND");
    while(1); // Halt
  }
  
  Serial.println("OLED initialized successfully");
  
  // Display startup screen
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0,0);
  display.println("Starting up...");
  display.println("Sensors: OK");
  display.println("OLED: OK");
  display.display();
  delay(2000);
  
  // Connect to WiFi
  connectToWiFi();
  
  // Test sensor readings
  Serial.println("\nTesting sensors...");
  testSensors();
}

void testSensors() {
  Serial.println("Sensor Test Results:");
  
  // Test LDR
  int ldrTest = digitalRead(LDR_PIN);
  Serial.print("LDR (Pin 34): ");
  Serial.println(ldrTest == HIGH ? "HIGH (DARK)" : "LOW (BRIGHT)");
  
  // Test PIR
  int pirTest = digitalRead(PIR_PIN);
  Serial.print("PIR (Pin 13): ");
  Serial.println(pirTest == HIGH ? "HIGH (Motion)" : "LOW (No Motion)");
  
  // Test DHT
  float testTemp = dht.readTemperature();
  float testHumid = dht.readHumidity();
  if (isnan(testTemp) || isnan(testHumid)) {
    Serial.println("DHT: FAILED - Check wiring!");
    Serial.println("DHT11 Wiring:");
    Serial.println("- Pin 1 -> 3.3V");
    Serial.println("- Pin 2 -> GPIO 4");
    Serial.println("- Pin 3 -> NC");
    Serial.println("- Pin 4 -> GND");
    Serial.println("(Add 10K resistor between Pin 1 and 2)");
  } else {
    Serial.print("DHT: OK - Temp=");
    Serial.print(testTemp);
    Serial.print("C, Humid=");
    Serial.print(testHumid);
    Serial.println("%");
  }
  Serial.println("======================");
}

void connectToWiFi() {
  display.clearDisplay();
  display.setCursor(0,0);
  display.println("WiFi: Connecting");
  display.print("SSID: ");
  display.println(WIFI_SSID);
  display.display();
  
  Serial.print("\nConnecting to WiFi: ");
  Serial.println(WIFI_SSID);
  
  WiFi.disconnect(true);
  delay(1000);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  unsigned long startTime = millis();
  int dots = 0;
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    
    // Update display with progress dots
    display.setCursor(0, 24);
    for (int i = 0; i < dots; i++) display.print(".");
    display.print(".");
    display.display();
    dots = (dots + 1) % 4;
    
    if (millis() - startTime > WIFI_TIMEOUT) {
      display.clearDisplay();
      display.setCursor(0,0);
      display.println("WiFi: FAILED!");
      display.println("Check:");
      display.println("1. SSID/Password");
      display.println("2. Router");
      display.display();
      Serial.println("\nWiFi connection timeout!");
      wifiConnected = false;
      return;
    }
  }
  
  wifiConnected = true;
  
  // Init and get time
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  
  display.clearDisplay();
  display.setCursor(0,0);
  display.println("WiFi: CONNECTED");
  display.print("IP: ");
  display.println(WiFi.localIP());
  display.display();
  
  Serial.println("\nWiFi connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
  
  delay(2000);
}

bool sendToAPI(float temperature, float humidity, int light, bool motion) {
  if (!wifiConnected || WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected. Reconnecting...");
    connectToWiFi();
    return false;
  }
  
  Serial.println("\nPreparing to send data...");
  Serial.print("API URL: ");
  Serial.println(API_URL);
  
  // Get current timestamp
  time_t now;
  time(&now);
  
  // Create JSON payload
  String jsonData = "{";
  jsonData += "\"temperature\":" + String(temperature, 1) + ",";
  jsonData += "\"humidity\":" + String(humidity, 1) + ",";
  jsonData += "\"light\":" + String(light) + ",";
  jsonData += "\"motion\":" + String(motion ? 1 : 0);
  // jsonData += "\"timestamp\":" + String((unsigned long)now); // Let server handle timestamp
  jsonData += "}";
  
  Serial.print("JSON Data: ");
  Serial.println(jsonData);
  
  WiFiClientSecure client;
  HTTPClient http;
  
  client.setInsecure(); // Skip SSL certificate verification
  
  if (http.begin(client, API_URL)) {
    http.addHeader("Content-Type", "application/json");
    http.addHeader("User-Agent", "ESP32-Sensor-Node");
    
    Serial.println("Sending POST request...");
    int httpCode = http.POST(jsonData);
    
    Serial.print("HTTP Response: ");
    Serial.println(httpCode);
    
    if (httpCode > 0) {
      String response = http.getString();
      Serial.print("Server Response: ");
      Serial.println(response);
      
      if (httpCode == 200 || httpCode == 201) {
        Serial.println("Data sent successfully!");
        http.end();
        return true;
      }
    } else {
      Serial.print("POST failed, error: ");
      Serial.println(http.errorToString(httpCode));
    }
    
    http.end();
  } else {
    Serial.println("Failed to connect to API endpoint");
  }
  
  return false;
}

bool pushToFirebase(float temperature, float humidity, int light, bool motion) {
  if (!wifiConnected || WiFi.status() != WL_CONNECTED) return false;
  
  WiFiClientSecure client;
  HTTPClient http;
  client.setInsecure();

  // Firebase REST API URL
  String url = String(FIREBASE_HOST) + "latest_reading.json?auth=" + String(FIREBASE_AUTH);
  
  if (http.begin(client, url)) {
    http.addHeader("Content-Type", "application/json");
    
    // Construct lightweight JSON
    String json = "{";
    json += "\"temperature\":" + String(temperature, 1) + ",";
    json += "\"humidity\":" + String(humidity, 1) + ",";
    json += "\"light\":" + String(light) + ",";
    json += "\"motion\":" + String(motion ? 1 : 0) + ",";
    json += "\"timestamp\":" + String((unsigned long)time(nullptr));
    json += "}";

    int httpCode = http.PUT(json); // Use PUT to overwrite the current state
    http.end();
    return (httpCode == 200);
  }
  return false;
}

void updateDisplay(float temp, float humid, bool light, bool motion, bool sendSuccess) {
  display.clearDisplay();
  
  // Line 1: Temperature and Humidity
  display.setCursor(0, 0);
  display.print("Temp: ");
  display.print(temp, 1);
  display.print("C");
  
  display.setCursor(70, 0);
  display.print("Hum: ");
  display.print(humid, 1);
  display.print("%");
  
  // Line 2: Light and Motion
  display.setCursor(0, 10);
  display.print("Light: ");
  display.print(light ? "BRIGHT" : "DARK");
  
  display.setCursor(70, 10);
  display.print("Motion: ");
  display.print(motion ? "YES" : "NO");
  
  // Line 3: WiFi and API Status
  display.setCursor(0, 20);
  display.print("WiFi: ");
  display.print(wifiConnected ? "ON" : "OFF");
  
  display.setCursor(70, 20);
  display.print("API: ");
  display.print(sendSuccess ? "OK" : "FAIL");
  
  display.display();
}

void loop() {
  unsigned long currentMillis = millis();
  
  // 1. FAST SENSORS: Read digital pins every loop for "instant" detection
  bool lightState = digitalRead(LDR_PIN) == LOW; // LOW when bright
  bool motionState = digitalRead(PIR_PIN) == HIGH; // HIGH when motion
  
  // 2. SLOW SENSORS: Read DHT only every 2 seconds
  static unsigned long lastDhtRead = 0;
  static float temperature = 25.0;
  static float humidity = 50.0;
  if (currentMillis - lastDhtRead >= 2000) {
      float t = dht.readTemperature();
      float h = dht.readHumidity();
      if (!isnan(t) && !isnan(h)) {
          temperature = t;
          humidity = h;
      }
      lastDhtRead = currentMillis;
  }

  // 3. LOW LATENCY FIREBASE: Push every 500ms for "instantaneous" feel
  static unsigned long lastFirebasePush = 0;
  if (currentMillis - lastFirebasePush >= 500) {
      pushToFirebase(temperature, humidity, lightState ? 1 : 0, motionState);
      lastFirebasePush = currentMillis;
  }

  // 4. SUPABASE API: Send every 3 seconds
  if (currentMillis - lastUpdate >= UPDATE_INTERVAL) {
    Serial.println("\n--- Sending to Supabase ---");
    lastSendSuccess = sendToAPI(temperature, humidity, lightState ? 1 : 0, motionState);
    
    // Update local OLED display
    updateDisplay(temperature, humidity, lightState, motionState, lastSendSuccess);
    
    lastUpdate = currentMillis;
  }
  
  // 5. PERIODIC WiFi CHECK
  static unsigned long lastWifiCheck = 0;
  if (currentMillis - lastWifiCheck >= 30000) {
    if (WiFi.status() != WL_CONNECTED) {
      wifiConnected = false;
      connectToWiFi();
    }
    lastWifiCheck = currentMillis;
  }
  
  delay(50); // Reduced delay for faster loop cycles (20Hz)
}