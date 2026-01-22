#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>
#include <WiFi.h>
#include <HTTPClient.h>

// --- SECRET CONFIGURATION ---
// Create a secrets.h file with your credentials (see secrets.h.example)
#include "secrets.h" 

// --- HARDWARE CONFIGURATION ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 32
#define OLED_RESET    -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

#define DHTPIN 4
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

#define LDR_PIN 34    // Light Sensor
#define PIR_PIN 13    // Motion Sensor

unsigned long lastUpdate = 0;
const unsigned long UPDATE_INTERVAL = 2000; // 2 seconds

void setup() {
  Serial.begin(115200);
  dht.begin();
  pinMode(LDR_PIN, INPUT);
  pinMode(PIR_PIN, INPUT);

  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("OLED Failed"));
    for(;;); 
  }

  connectToWiFi();
}

void connectToWiFi() {
  display.clearDisplay();
  display.setCursor(0,0);
  display.println("Connecting WiFi...");
  display.display();
  
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected!");
  Serial.println(WiFi.localIP());
}

// Use WiFiClientSecure for HTTPS (Vercel requires TLS)
    WiFiClientSecure client;
    client.setInsecure(); // Skip certificate validation for simplicity
    
    HTTPClient http;
    // Connect with the secure client
    if (http.begin(client, API_URL)) { 
      http.addHeader("Content-Type", "application/json");
      
      // Optimized: Send light/motion as integers (1/0) for faster DB queries
      String json = "{";
      json += "\"temperature\":" + String(t, 1) + ",";
      json += "\"humidity\":" + String(h, 1) + ",";
      json += "\"light\":" + String(light) + ",";
      json += "\"motion\":" + String(motion);
      json += "}";
      
      Serial.println("Sending data: " + json);
      int httpResponseCode = http.POST(json);
      
      if (httpResponseCode > 0) {
        Serial.print("HTTP Response code: ");
        Serial.println(httpResponseCode);
        String payload = http.getString();
        Serial.println(payload);
      } else {
        Serial.print("Error code: ");
        Serial.println(httpResponseCode);
        Serial.print("Error message: ");
        Serial.println(http.errorToString(httpResponseCode));
      }
      http.end();
    } else {
      Serial.println("Unable to connect to API URL");
    }
  } else {
    Serial.println("WiFi Disconnected");
  }
}

void loop() {
  if (millis() - lastUpdate >= UPDATE_INTERVAL) {
    float h = dht.readHumidity();
    float t = dht.readTemperature();
    int lightVal = digitalRead(LDR_PIN);
    int motionVal = digitalRead(PIR_PIN);
    
    // Convert to integer values for database (1 = BRIGHT/YES, 0 = DARK/NO)
    int lightInt = (lightVal == LOW) ? 1 : 0;
    int motionInt = (motionVal == HIGH) ? 1 : 0;
    
    // Keep labels for display
    String lightLabel = lightInt ? "BRIGHT" : "DARK";
    String motionLabel = motionInt ? "YES" : "NO";

    if (!isnan(h) && !isnan(t)) {
      sendData(t, h, lightInt, motionInt);
      
      // Update Display
      display.clearDisplay();
      display.setCursor(0, 0);
      display.print("T:"); display.print(t, 1);
      display.print(" H:"); display.print(h, 1);
      display.setCursor(0, 10);
      display.print("L:"); display.print(lightLabel);
      display.setCursor(64, 10);
      display.print("M:"); display.print(motionLabel);
      display.setCursor(0, 20);
      display.print("Sent -> API");
      display.display();
    }
    
    lastUpdate = millis();
  }
}