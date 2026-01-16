package utils

import (
    "os"
)

// LoadPublicKey reads a PEM public key from path and returns it as string
func LoadPublicKey(path string) (string, error) {
    b, err := os.ReadFile(path)
    if err != nil {
        return "", err
    }
    return string(b), nil
}

