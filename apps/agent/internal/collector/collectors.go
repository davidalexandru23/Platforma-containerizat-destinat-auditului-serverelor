package collector

import (
	"bufio"
	"fmt"
	"net"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/load"
	"github.com/shirou/gopsutil/v3/mem"
	psnet "github.com/shirou/gopsutil/v3/net"
	"github.com/shirou/gopsutil/v3/process"
)

// Informatii per partitie disc
type DiskInfo struct {
	MountPoint string `json:"mountPoint"`
	FsType     string `json:"fsType"`
	UsedBytes  uint64 `json:"usedBytes"`
	TotalBytes uint64 `json:"totalBytes"`
}

// Informatii per interfata retea
type NetInterfaceInfo struct {
	Name       string `json:"name"`
	BytesRecv  uint64 `json:"bytesRecv"`
	BytesSent  uint64 `json:"bytesSent"`
	PacketsIn  uint64 `json:"packetsIn"`
	PacketsOut uint64 `json:"packetsOut"`
	Errors     uint64 `json:"errors"`
}

// Informatii detaliate per proces
type ProcessInfo struct {
	PID     int32   `json:"pid"`
	Name    string  `json:"name"`
	CPU     float64 `json:"cpu"`
	MemMB   float64 `json:"memMB"`
	Command string  `json:"command"`
}

type MetricsCollector struct{}

type Metrics struct {
	CpuPercent     float64  `json:"cpuPercent"`
	MemUsedBytes   uint64   `json:"memUsedBytes"`
	MemTotalBytes  uint64   `json:"memTotalBytes"`
	DiskUsedBytes  uint64   `json:"diskUsedBytes"`
	DiskTotalBytes uint64   `json:"diskTotalBytes"`
	NetInBytes     uint64   `json:"netInBytes"`
	NetOutBytes    uint64   `json:"netOutBytes"`
	LoadAvg1       float64  `json:"loadAvg1"`
	LoadAvg5       float64  `json:"loadAvg5"`
	LoadAvg15      float64  `json:"loadAvg15"`
	TopProcesses   []string `json:"topProcesses"`
	ReportedIP     string   `json:"reportedIP,omitempty"`
}

func NewMetricsCollector() *MetricsCollector {
	return &MetricsCollector{}
}

func (mc *MetricsCollector) Collect() (*Metrics, error) {
	m := &Metrics{}

	// CPU
	cpuPercent, err := cpu.Percent(0, false)
	if err == nil && len(cpuPercent) > 0 {
		m.CpuPercent = cpuPercent[0]
	}

	// Memorie
	memInfo, err := mem.VirtualMemory()
	if err == nil {
		m.MemUsedBytes = memInfo.Used
		m.MemTotalBytes = memInfo.Total
	}

	// Colectare disc (partitie root)
	diskInfo, err := disk.Usage("/")
	if err == nil {
		m.DiskUsedBytes = diskInfo.Used
		m.DiskTotalBytes = diskInfo.Total
	}

	// Retea
	netStats, err := psnet.IOCounters(false)
	if err == nil && len(netStats) > 0 {
		m.NetInBytes = netStats[0].BytesRecv
		m.NetOutBytes = netStats[0].BytesSent
	}

	// Colectare incarcare medie
	loadInfo, err := load.Avg()
	if err == nil {
		m.LoadAvg1 = loadInfo.Load1
		m.LoadAvg5 = loadInfo.Load5
		m.LoadAvg15 = loadInfo.Load15
	}

	// Colectare top procese CPU
	procs, err := process.Processes()
	if err == nil {
		type procInfo struct {
			name string
			cpu  float64
		}
		var procInfos []procInfo

		for _, p := range procs {
			name, _ := p.Name()
			cpuPct, _ := p.CPUPercent()
			if name != "" {
				procInfos = append(procInfos, procInfo{name, cpuPct})
			}
		}

		// Sortare descrescatoare dupa CPU (top 5)
		for i := 0; i < len(procInfos) && i < 5; i++ {
			for j := i + 1; j < len(procInfos); j++ {
				if procInfos[j].cpu > procInfos[i].cpu {
					procInfos[i], procInfos[j] = procInfos[j], procInfos[i]
				}
			}
		}

		for i := 0; i < len(procInfos) && i < 5; i++ {
			m.TopProcesses = append(m.TopProcesses, procInfos[i].name)
		}
	}

	// Detectare IP local (prima adresa IPv4 non-loopback)
	if ip := getLocalIP(); ip != "" {
		m.ReportedIP = ip
	}

	return m, nil
}

// Colectare metrici extinse (per-core, per-disk, per-interfata, swap, procese)
func (mc *MetricsCollector) CollectDetailed() (*DetailedMetrics, error) {
	d := &DetailedMetrics{}

	// Colectare CPU per-core (interval scurt pentru metrici recente)
	perCore, err := cpu.Percent(200*time.Millisecond, true)
	if err == nil {
		d.CpuPerCore = perCore
		d.CpuCount = len(perCore)
	}

	// Colectare memorie detaliata (available, cached, buffers)
	memInfo, err := mem.VirtualMemory()
	if err == nil {
		d.MemAvailableBytes = memInfo.Available
		d.MemCachedBytes = memInfo.Cached
		d.MemBuffersBytes = memInfo.Buffers
	}

	// Swap
	swapInfo, err := mem.SwapMemory()
	if err == nil {
		d.SwapUsedBytes = swapInfo.Used
		d.SwapTotalBytes = swapInfo.Total
	}

	// Colectare disc - toate partitiile montate
	partitions, err := disk.Partitions(false)
	if err == nil {
		for _, p := range partitions {
			usage, err := disk.Usage(p.Mountpoint)
			if err == nil && usage.Total > 0 {
				d.Disks = append(d.Disks, DiskInfo{
					MountPoint: p.Mountpoint,
					FsType:     p.Fstype,
					UsedBytes:  usage.Used,
					TotalBytes: usage.Total,
				})
			}
		}
	}

	// Colectare retea - per interfata
	netStats, err := psnet.IOCounters(true) // true = per interfata
	if err == nil {
		for _, iface := range netStats {
			// Excludere loopback si interfete virtuale
			if iface.Name == "lo" || strings.HasPrefix(iface.Name, "veth") {
				continue
			}
			d.NetInterfaces = append(d.NetInterfaces, NetInterfaceInfo{
				Name:       iface.Name,
				BytesRecv:  iface.BytesRecv,
				BytesSent:  iface.BytesSent,
				PacketsIn:  iface.PacketsRecv,
				PacketsOut: iface.PacketsSent,
				Errors:     iface.Errin + iface.Errout,
			})
		}
	}

	// Colectare top procese detaliate (10)
	procs, err := process.Processes()
	if err == nil {
		type procDetail struct {
			pid  int32
			name string
			cpu  float64
			mem  float64
			cmd  string
		}
		var details []procDetail

		for _, p := range procs {
			name, _ := p.Name()
			cpuPct, _ := p.CPUPercent()
			memInfo, _ := p.MemoryInfo()

			var memMB float64
			if memInfo != nil {
				memMB = float64(memInfo.RSS) / 1024 / 1024
			}

			cmdLine, _ := p.Cmdline()
			if cmdLine == "" {
				cmdLine = name
			}
			// Limitare lungime comanda afisata
			if len(cmdLine) > 100 {
				cmdLine = cmdLine[:100] + "..."
			}

			if name != "" {
				details = append(details, procDetail{p.Pid, name, cpuPct, memMB, cmdLine})
			}
		}

		// Sortare descrescatoare dupa CPU (top 10)
		for i := 0; i < len(details) && i < 10; i++ {
			for j := i + 1; j < len(details); j++ {
				if details[j].cpu > details[i].cpu {
					details[i], details[j] = details[j], details[i]
				}
			}
		}

		for i := 0; i < len(details) && i < 10; i++ {
			d.TopProcessesDetailed = append(d.TopProcessesDetailed, ProcessInfo{
				PID:     details[i].pid,
				Name:    details[i].name,
				CPU:     details[i].cpu,
				MemMB:   details[i].mem,
				Command: fmt.Sprintf("%s", details[i].cmd),
			})
		}
	}

	return d, nil
}

func getLocalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return ""
	}
	for _, addr := range addrs {
		if ipNet, ok := addr.(*net.IPNet); ok && !ipNet.IP.IsLoopback() && ipNet.IP.To4() != nil {
			return ipNet.IP.String()
		}
	}
	return ""
}

type InventoryCollector struct{}

type Inventory struct {
	OsInfo   map[string]interface{}   `json:"osInfo"`
	Packages []string                 `json:"packages"`
	Services []string                 `json:"services"`
	Ports    []map[string]interface{} `json:"ports"`
	Users    []string                 `json:"users"`
}

func NewInventoryCollector() *InventoryCollector {
	return &InventoryCollector{}
}

func (ic *InventoryCollector) Collect() (*Inventory, error) {
	inv := &Inventory{
		OsInfo:   make(map[string]interface{}),
		Packages: []string{},
		Services: []string{},
		Ports:    []map[string]interface{}{},
		Users:    []string{},
	}

	// Colectare info sistem
	hostInfo, err := host.Info()
	if err == nil {
		inv.OsInfo["hostname"] = hostInfo.Hostname
		inv.OsInfo["os"] = hostInfo.OS
		inv.OsInfo["platform"] = hostInfo.Platform
		inv.OsInfo["platformVersion"] = hostInfo.PlatformVersion
		inv.OsInfo["kernelVersion"] = hostInfo.KernelVersion
		inv.OsInfo["kernelArch"] = hostInfo.KernelArch
		inv.OsInfo["uptime"] = hostInfo.Uptime
	}

	// Colectare porturi deschise
	conns, err := psnet.Connections("inet")
	if err == nil {
		seen := make(map[uint32]bool)
		for _, conn := range conns {
			if conn.Status == "LISTEN" && !seen[conn.Laddr.Port] {
				seen[conn.Laddr.Port] = true
				inv.Ports = append(inv.Ports, map[string]interface{}{
					"port":    conn.Laddr.Port,
					"address": conn.Laddr.IP,
					"type":    "tcp",
				})
			}
		}
	}

	// Colectare utilizatori sistem
	inv.Users = getSystemUsers()

	// Colectare pachete instalate
	inv.Packages = getInstalledPackages()

	// Colectare servicii active
	inv.Services = getActiveServices()

	return inv, nil
}

func getSystemUsers() []string {
	var users []string
	file, err := os.Open("/etc/passwd")
	if err != nil {
		return users
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.Split(line, ":")
		if len(parts) > 0 {
			users = append(users, parts[0])
		}
	}
	return users
}

func getInstalledPackages() []string {
	var packages []string

	// Incercare dpkg (Debian/Ubuntu)
	cmd := exec.Command("dpkg-query", "-W", "-f=${Package}\n")
	output, err := cmd.Output()
	if err == nil {
		lines := strings.Split(strings.TrimSpace(string(output)), "\n")
		for _, line := range lines {
			if line != "" {
				packages = append(packages, line)
			}
		}
		return packages
	}

	// Incercare rpm (RHEL/CentOS)
	cmd = exec.Command("rpm", "-qa", "--qf", "%{NAME}\n")
	output, err = cmd.Output()
	if err == nil {
		lines := strings.Split(strings.TrimSpace(string(output)), "\n")
		for _, line := range lines {
			if line != "" {
				packages = append(packages, line)
			}
		}
	}

	return packages
}

func getActiveServices() []string {
	var services []string

	cmd := exec.Command("systemctl", "list-units", "--type=service", "--state=active", "--no-legend", "--no-pager")
	output, err := cmd.Output()
	if err != nil {
		return services
	}

	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) > 0 {
			svc := strings.TrimSuffix(fields[0], ".service")
			services = append(services, svc)
		}
	}

	return services
}
