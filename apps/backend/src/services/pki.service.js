
import crypto from 'crypto';
import forge from 'node-forge';
import fs from 'fs';
import path from 'path';
import { log } from '../lib/logger.js';

const CERTS_DIR = 'certs';
const CA_KEY_PATH = path.join(CERTS_DIR, 'ca.key');
const CA_CERT_PATH = path.join(CERTS_DIR, 'ca.crt');
const BACKEND_KEY_PATH = path.join(CERTS_DIR, 'backend.key'); // Cheie pentru semnare comenzi
const BACKEND_PUB_PATH = path.join(CERTS_DIR, 'backend_pub.key');

// Cache in memorie
let caKey = null;
let caCert = null;
let backendKey = null; // Cheie privata pentru semnare comenzi

// Initializare PKI: Creare CA daca nu exista
export function initPKI() {
    if (!fs.existsSync(CERTS_DIR)) {
        fs.mkdirSync(CERTS_DIR, { recursive: true });
    }

    if (fs.existsSync(CA_KEY_PATH) && fs.existsSync(CA_CERT_PATH)) {
        log.info('PKI: Loading existing CA...');
        const keyPem = fs.readFileSync(CA_KEY_PATH, 'utf8');
        const certPem = fs.readFileSync(CA_CERT_PATH, 'utf8');
        caKey = forge.pki.privateKeyFromPem(keyPem);
        caCert = forge.pki.certificateFromPem(certPem);
    } else {
        log.info('PKI: Generating new CA...');
        generateCA();
    }

    // Initializare/Incarcare Cheie Semnare Backend
    if (fs.existsSync(BACKEND_KEY_PATH) && fs.existsSync(BACKEND_PUB_PATH)) {
        log.info('PKI: Loading backend signing key...');
        const keyPem = fs.readFileSync(BACKEND_KEY_PATH, 'utf8');
        backendKey = forge.pki.privateKeyFromPem(keyPem);
    } else {
        log.info('PKI: Generating backend signing key...');
        generateBackendKey();
    }
}

function generateCA() {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    caKey = keys.privateKey;
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

    const attrs = [{
        name: 'commonName',
        value: 'BitTrail Internal CA'
    }, {
        name: 'organizationName',
        value: 'BitTrail Security'
    }];

    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(caKey, forge.md.sha256.create());
    caCert = cert;

    fs.writeFileSync(CA_KEY_PATH, forge.pki.privateKeyToPem(caKey));
    fs.writeFileSync(CA_CERT_PATH, forge.pki.certificateToPem(cert));
}

function generateBackendKey() {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    backendKey = keys.privateKey;

    fs.writeFileSync(BACKEND_KEY_PATH, forge.pki.privateKeyToPem(keys.privateKey));
    fs.writeFileSync(BACKEND_PUB_PATH, forge.pki.publicKeyToPem(keys.publicKey));
}

/**
 * Semneaza un CSR de la agent si returneaza certificatul
 * @param {string} csrPem - CSR codat PEM
 * @param {string} commonName - CN asteptat (de obicei ID agent sau hostname)
 */
export function signCSR(csrPem, commonName) {
    if (!caKey || !caCert) initPKI();

    const csr = forge.pki.certificationRequestFromPem(csrPem);

    if (!csr.verify()) {
        throw new Error('CSR signature invalid');
    }

    const cert = forge.pki.createCertificate();
    cert.serialNumber = crypto.randomUUID().replace(/-/g, ''); // Serial unic
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

    cert.publicKey = csr.publicKey;
    cert.setSubject(csr.subject.attributes);
    cert.setIssuer(caCert.subject.attributes);

    // Extensii
    cert.setExtensions([{
        name: 'basicConstraints',
        cA: false
    }, {
        name: 'keyUsage',
        keyCertSign: false,
        digitalSignature: true,
        keyEncipherment: true,
        dataEncipherment: true
    }, {
        name: 'subjectAltName',
        altNames: [{
            type: 2, // DNS
            value: commonName
        }]
    }]);

    cert.sign(caKey, forge.md.sha256.create());

    return {
        cert: forge.pki.certificateToPem(cert),
        serial: cert.serialNumber,
        caCert: forge.pki.certificateToPem(caCert),
        backendPublicKey: fs.readFileSync(BACKEND_PUB_PATH, 'utf8') // Cheie publica backend pentru verificare comenzi de catre agent
    };
}

/**
 * Semneaza un payload comanda folosind cheia privata backend (PKCS1v15 + SHA256)
 * Sincronizat cu agentul Go: rsa.VerifyPKCS1v15
 */
export function signCommand(data) {
    if (!backendKey) initPKI();

    const keyPem = fs.readFileSync(BACKEND_KEY_PATH, 'utf8');
    const sign = crypto.createSign('SHA256');
    sign.update(data, 'utf8');
    sign.end();
    return sign.sign(keyPem, 'base64');
}

/**
 * Verifica semnatura de la agent (PKCS1v15 + SHA256)
 * Sincronizat cu agentul Go: rsa.SignPKCS1v15
 */
export function verifyAgentSignature(data, signatureBase64, publicKeyPem) {
    try {
        const verify = crypto.createVerify('SHA256');
        verify.update(data, 'utf8');
        verify.end();
        return verify.verify(publicKeyPem, signatureBase64, 'base64');
    } catch (err) {
        console.error('Signature verification failed:', err);
        return false;
    }
}
