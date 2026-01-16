package utils

import (
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"strings"
	"github.com/golang-jwt/jwt/v5"
)

func base64UrlEncode(data []byte) string {
	encoded := base64.StdEncoding.EncodeToString(data)
	encoded = strings.ReplaceAll(encoded, "+", "-")
	encoded = strings.ReplaceAll(encoded, "/", "_")
	encoded = strings.TrimRight(encoded, "=")
	return encoded
}

func CreateJWS(payload interface{}, privateKey string) (string, error) {
	// Create header
	header := map[string]string{
		"alg": "RS256",
		"typ": "JWT",
	}

	// Convert header to JSON and base64url encode
	headerBytes, err := json.Marshal(header)
	if err != nil {
		return "", err
	}
	headerEncoded := base64UrlEncode(headerBytes)

	// Convert payload to JSON and base64url encode
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	payloadEncoded := base64UrlEncode(payloadBytes)

	// Create signing input
	signingInput := headerEncoded + "." + payloadEncoded

	// Parse private key
	privKey, err := jwt.ParseRSAPrivateKeyFromPEM([]byte(privateKey))
	if err != nil {
		return "", err
	}

	// Create signature
	hashed := sha256.Sum256([]byte(signingInput))
	signature, err := rsa.SignPKCS1v15(nil, privKey, crypto.SHA256, hashed[:])
	if err != nil {
		return "", err
	}

	// Encode signature
	signatureEncoded := base64UrlEncode(signature)

	// Combine all parts
	token := signingInput + "." + signatureEncoded

	return token, nil
}