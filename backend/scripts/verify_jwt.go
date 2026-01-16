package main

import (
	"fmt"
	"os"

	"github.com/golang-jwt/jwt/v5"
)

func main() {
	pubPEM := os.Getenv("AUTH_PUBLIC_KEY") // or paste the PEM here
	tokenStr := os.Args[1]

	pubKey, err := jwt.ParseRSAPublicKeyFromPEM([]byte(pubPEM))
	if err != nil {
		panic(err)
	}

	tok, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
		if t.Method.Alg() != jwt.SigningMethodRS256.Alg() {
			return nil, fmt.Errorf("unexpected alg: %s", t.Method.Alg())
		}
		return pubKey, nil
	})
	fmt.Printf("valid=%v err=%v\n", tok != nil && tok.Valid, err)
}
