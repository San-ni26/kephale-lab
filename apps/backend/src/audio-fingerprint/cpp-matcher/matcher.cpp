#include <napi.h>
#include <vector>
#include <complex>
#include <cmath>
#include <unordered_map>
#include <algorithm>

const double PI = 3.14159265358979323846;
const int WINDOW_SIZE = 1024;
const int HOP_SIZE = 256;
const int TARGET_ZONE_START = 1;
const int TARGET_ZONE_END = 5; // Limite à 5 frames pour éviter l'explosion combinatoire
const int BANDS[] = {10, 20, 40, 80, 160, 512}; // Bandes de fréquences pour trouver des pics
const int NUM_BANDS = 5;

// In-place iterative Cooley-Tukey FFT
void fft(std::vector<std::complex<double>>& a) {
    int n = a.size();
    for (int i = 1, j = 0; i < n; i++) {
        int bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) std::swap(a[i], a[j]);
    }
    for (int len = 2; len <= n; len <<= 1) {
        double angle = -2 * PI / len;
        std::complex<double> wlen(cos(angle), sin(angle));
        for (int i = 0; i < n; i += len) {
            std::complex<double> w(1);
            for (int j = 0; j < len / 2; j++) {
                std::complex<double> u = a[i+j], v = a[i+j+len/2] * w;
                a[i+j] = u + v;
                a[i+j+len/2] = u - v;
                w *= wlen;
            }
        }
    }
}

// Structure pour un pic de fréquence
struct Peak {
    int timeIndex;
    int freqIndex;
};

// Expose GenerateHashes à Node.js
// Prend un Float32Array de données PCM en entrée
// Retourne un Uint32Array sous forme [hash1, time1, hash2, time2, ...]
Napi::Value GenerateHashes(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsTypedArray()) {
        Napi::TypeError::New(env, "Expected Float32Array of PCM data").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    Napi::Float32Array input = info[0].As<Napi::Float32Array>();
    size_t numSamples = input.ElementLength();
    const float* pcm = input.Data();
    
    std::vector<double> hanning(WINDOW_SIZE);
    for (int i = 0; i < WINDOW_SIZE; ++i) {
        hanning[i] = 0.5 * (1 - cos(2 * PI * i / (WINDOW_SIZE - 1)));
    }
    
    std::vector<Peak> peaks;
    
    // STFT & Peak Finding
    int timeIndex = 0;
    for (size_t i = 0; i + WINDOW_SIZE < numSamples; i += HOP_SIZE) {
        std::vector<std::complex<double>> frame(WINDOW_SIZE);
        for (int j = 0; j < WINDOW_SIZE; ++j) {
            frame[j] = std::complex<double>(pcm[i + j] * hanning[j], 0.0);
        }
        
        fft(frame);
        
        // Find maximum magnitude in each frequency band
        for (int band = 0; band < NUM_BANDS; ++band) {
            double maxMag = -1.0;
            int maxFreq = -1;
            
            for (int f = BANDS[band]; f < BANDS[band+1]; ++f) {
                double mag = std::abs(frame[f]);
                if (mag > maxMag) {
                    maxMag = mag;
                    maxFreq = f;
                }
            }
            
            // Si le pic est assez fort
            if (maxMag > 0.1) { // Threshold
                peaks.push_back({timeIndex, maxFreq});
            }
        }
        timeIndex++;
    }
    
    // Combinatorial Hashing (Constellation Map)
    // Structure du hash (32 bits) : 
    // - freq1 : 9 bits (0-511)
    // - freq2 : 9 bits (0-511)
    // - deltaTime : 14 bits (0-16383)
    std::vector<uint32_t> hashes;
    
    for (size_t i = 0; i < peaks.size(); ++i) {
        for (size_t j = i + 1; j < peaks.size(); ++j) {
            int dt = peaks[j].timeIndex - peaks[i].timeIndex;
            if (dt < TARGET_ZONE_START) continue;
            if (dt > TARGET_ZONE_END) break; // Peaks array is ordered by time
            
            uint32_t f1 = peaks[i].freqIndex & 0x1FF;
            uint32_t f2 = peaks[j].freqIndex & 0x1FF;
            uint32_t deltaT = dt & 0x3FFF;
            
            uint32_t hash = (f1) | (f2 << 9) | (deltaT << 18);
            
            hashes.push_back(hash);
            hashes.push_back(peaks[i].timeIndex); // Stocke le temps du pic initial
        }
    }
    
    // Retourner les hashes et temps vers JavaScript
    Napi::Uint32Array result = Napi::Uint32Array::New(env, hashes.size());
    for (size_t i = 0; i < hashes.size(); ++i) {
        result[i] = hashes[i];
    }
    
    return result;
}

// Initialise le module C++ pour Node.js
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "generateHashes"), Napi::Function::New(env, GenerateHashes));
    return exports;
}

NODE_API_MODULE(audiomatcher, Init)
