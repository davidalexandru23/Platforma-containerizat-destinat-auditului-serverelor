package collector

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	g "github.com/gosnmp/gosnmp"
)

// Definire OID-uri enterprise private BitTrail
const (
	OIDBase           = "1.3.6.1.4.1.99999"
	OIDCpuPercent     = OIDBase + ".1"  // Gauge32 - CPU % agregat
	OIDMemUsed        = OIDBase + ".2"  // Counter64 - Memorie folosita (bytes)
	OIDMemTotal       = OIDBase + ".3"  // Counter64 - Memorie totala (bytes)
	OIDDiskUsed       = OIDBase + ".4"  // Counter64 - Disc folosit (bytes)
	OIDDiskTotal      = OIDBase + ".5"  // Counter64 - Disc total (bytes)
	OIDNetIn          = OIDBase + ".6"  // Counter64 - Retea intrare (bytes)
	OIDNetOut         = OIDBase + ".7"  // Counter64 - Retea iesire (bytes)
	OIDLoadAvg1       = OIDBase + ".8"  // OctetString - Load average 1m
	OIDLoadAvg5       = OIDBase + ".9"  // OctetString - Load average 5m
	OIDLoadAvg15      = OIDBase + ".10" // OctetString - Load average 15m
	OIDServerID       = OIDBase + ".11" // OctetString - ID server
	OIDDetailedJSON   = OIDBase + ".12" // OctetString - JSON metrici detaliate
	OIDTimestamp      = OIDBase + ".13" // OctetString - Timestamp colectare
	OIDTrapOID        = "1.3.6.1.6.3.1.1.4.1.0"
	OIDSysUptime      = "1.3.6.1.2.1.1.3.0"
	OIDTrapEnterprise = OIDBase + ".0.1" // Trap metrici
)

// Trimitere metrici SNMP
type SNMPSender struct {
	target    string // Host backend
	port      uint16 // Port SNMP trap
	community string // Community string
	serverID  string // ID-ul serverului
}

// Initializare sender SNMP
func NewSNMPSender(target string, port int, community string, serverID string) *SNMPSender {
	return &SNMPSender{
		target:    target,
		port:      uint16(port),
		community: community,
		serverID:  serverID,
	}
}

// Definire metrici detaliate pentru payload JSON
type DetailedMetrics struct {
	CpuPerCore           []float64          `json:"cpuPerCore"`
	CpuCount             int                `json:"cpuCount"`
	MemAvailableBytes    uint64             `json:"memAvailableBytes"`
	MemCachedBytes       uint64             `json:"memCachedBytes"`
	MemBuffersBytes      uint64             `json:"memBuffersBytes"`
	SwapUsedBytes        uint64             `json:"swapUsedBytes"`
	SwapTotalBytes       uint64             `json:"swapTotalBytes"`
	Disks                []DiskInfo         `json:"disks"`
	NetInterfaces        []NetInterfaceInfo `json:"netInterfaces"`
	TopProcessesDetailed []ProcessInfo      `json:"topProcessesDetailed"`
}

// Trimitere metrici ca SNMP trap UDP
func (s *SNMPSender) SendMetricsTrap(metrics *Metrics, detailed *DetailedMetrics) error {
	// Configurare conexiune SNMP trap
	snmp := &g.GoSNMP{
		Target:    s.target,
		Port:      s.port,
		Community: s.community,
		Version:   g.Version2c,
		Timeout:   time.Duration(2) * time.Second,
		Retries:   0, // Fire-and-forget, fara retry
		Logger:    g.NewLogger(log.New(log.Writer(), "", 0)),
	}

	if err := snmp.Connect(); err != nil {
		return fmt.Errorf("eroare conectare SNMP: %w", err)
	}
	defer snmp.Conn.Close()

	// Serializare metrici detaliate in JSON
	detailedJSON, err := json.Marshal(detailed)
	if err != nil {
		return fmt.Errorf("eroare serializare metrici detaliate: %w", err)
	}

	// Construire lista variabile SNMP (varbinds)
	trap := g.SnmpTrap{
		Variables: []g.SnmpPDU{
			// sysUptime
			{Name: OIDSysUptime, Type: g.TimeTicks, Value: uint32(time.Now().Unix())},
			// Trap OID
			{Name: OIDTrapOID, Type: g.ObjectIdentifier, Value: OIDTrapEnterprise},
			// Metrici agregate
			{Name: OIDCpuPercent, Type: g.Gauge32, Value: uint(metrics.CpuPercent * 100)}, // x100 pentru precizie
			{Name: OIDMemUsed, Type: g.OctetString, Value: fmt.Sprintf("%d", metrics.MemUsedBytes)},
			{Name: OIDMemTotal, Type: g.OctetString, Value: fmt.Sprintf("%d", metrics.MemTotalBytes)},
			{Name: OIDDiskUsed, Type: g.OctetString, Value: fmt.Sprintf("%d", metrics.DiskUsedBytes)},
			{Name: OIDDiskTotal, Type: g.OctetString, Value: fmt.Sprintf("%d", metrics.DiskTotalBytes)},
			{Name: OIDNetIn, Type: g.OctetString, Value: fmt.Sprintf("%d", metrics.NetInBytes)},
			{Name: OIDNetOut, Type: g.OctetString, Value: fmt.Sprintf("%d", metrics.NetOutBytes)},
			{Name: OIDLoadAvg1, Type: g.OctetString, Value: fmt.Sprintf("%.2f", metrics.LoadAvg1)},
			{Name: OIDLoadAvg5, Type: g.OctetString, Value: fmt.Sprintf("%.2f", metrics.LoadAvg5)},
			{Name: OIDLoadAvg15, Type: g.OctetString, Value: fmt.Sprintf("%.2f", metrics.LoadAvg15)},
			// Identificare server
			{Name: OIDServerID, Type: g.OctetString, Value: s.serverID},
			// JSON metrici detaliate (per-core, per-disk, per-interfata, procese)
			{Name: OIDDetailedJSON, Type: g.OctetString, Value: string(detailedJSON)},
			// Timestamp colectare
			{Name: OIDTimestamp, Type: g.OctetString, Value: time.Now().UTC().Format(time.RFC3339)},
		},
	}

	// Trimitere trap SNMPv2c catre backend
	_, err = snmp.SendTrap(trap)
	if err != nil {
		return fmt.Errorf("eroare trimitere trap SNMP: %w", err)
	}

	return nil
}
