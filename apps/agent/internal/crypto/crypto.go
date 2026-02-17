package crypto

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"os"
	"regexp"
)

// GenerateKeyPair genereaza o pereche chei RSA 2048
func GenerateKeyPair() (*rsa.PrivateKey, error) {
	return rsa.GenerateKey(rand.Reader, 2048)
}

// GenerateCSR creeaza cerere semnare certificat
func GenerateCSR(key *rsa.PrivateKey, commonName string) ([]byte, error) {
	subj := pkix.Name{
		CommonName:   commonName,
		Organization: []string{"BitTrail Agent"},
	}

	template := x509.CertificateRequest{
		Subject:            subj,
		SignatureAlgorithm: x509.SHA256WithRSA,
	}

	csrBytes, err := x509.CreateCertificateRequest(rand.Reader, &template, key)
	if err != nil {
		return nil, err
	}

	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE REQUEST", Bytes: csrBytes}), nil
}

// SignData semneaza date folosind cheia privata (SHA256)
func SignData(key *rsa.PrivateKey, data []byte) (string, error) {
	hashed := sha256.Sum256(data)
	signature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, hashed[:])
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(signature), nil
}

// VerifySignature verifica semnatura folosind cheie publica PEM
func VerifySignature(pubKeyPEM []byte, data []byte, sigBase64 string) error {
	block, _ := pem.Decode(pubKeyPEM)
	if block == nil {
		return fmt.Errorf("failed to parse PEM block containing the public key")
	}

	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return fmt.Errorf("failed to parse DER encoded public key: %v", err)
	}

	rsaPub, ok := pub.(*rsa.PublicKey)
	if !ok {
		return fmt.Errorf("key is not of type RSA public key")
	}

	sig, err := base64.StdEncoding.DecodeString(sigBase64)
	if err != nil {
		return fmt.Errorf("failed to decode signature: %v", err)
	}

	hashed := sha256.Sum256(data)
	return rsa.VerifyPKCS1v15(rsaPub, crypto.SHA256, hashed[:], sig)
}

// RedactSecrets inlocuieste secrete cunoscute cu [REDACTED]
func RedactSecrets(input string) string {
	patterns := []string{
		`(password|passwd|pwd|secret|token|key|api_key|access_token|refresh_token)\s*[:=]\s*["']?([a-zA-Z0-9_\-\.\@\!]+)["']?`,
		`-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----`,
		`-----BEGIN RSA PRIVATE KEY-----[\s\S]*?-----END RSA PRIVATE KEY-----`,
	}

	redacted := input
	for _, p := range patterns {
		re := regexp.MustCompile("(?i)" + p)
		redacted = re.ReplaceAllString(redacted, "$1: [REDACTED]")
	}
	return redacted
}

// CalculateHash calculeaza hash SHA-256 al sirului
func CalculateHash(input string) string {
	hash := sha256.Sum256([]byte(input))
	return hex.EncodeToString(hash[:])
}

// SavePEM salveaza bloc PEM in fisier
func SavePEM(path, typeStr string, bytes []byte) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	return pem.Encode(f, &pem.Block{Type: typeStr, Bytes: bytes})
}

// SaveFile salveaza bytes in fisier
func SaveFile(path string, data []byte) error {
	return os.WriteFile(path, data, 0644)
}

// LoadPrivateKey incarca cheie privata RSA din fisier PEM
func LoadPrivateKey(path string) (*rsa.PrivateKey, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	block, _ := pem.Decode(data)
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM block")
	}

	return x509.ParsePKCS1PrivateKey(block.Bytes)
}
