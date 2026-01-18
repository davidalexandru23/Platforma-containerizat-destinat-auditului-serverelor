package collector

import (
	"bufio"
	"os"
	"os/exec"
	"strings"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/load"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
	"github.com/shirou/gopsutil/v3/process"
)

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
}

func NewMetricsCollector() *MetricsCollector {
	return &MetricsCollector{}
}

func (mc *MetricsCollector) Collect() (*Metrics, error) {
	m := &Metrics{}

	// cpu
	cpuPercent, err := cpu.Percent(0, false)
	if err == nil && len(cpuPercent) > 0 {
		m.CpuPercent = cpuPercent[0]
	}

	// memorie
	memInfo, err := mem.VirtualMemory()
	if err == nil {
		m.MemUsedBytes = memInfo.Used
		m.MemTotalBytes = memInfo.Total
	}

	// disk (partitie root)
	diskInfo, err := disk.Usage("/")
	if err == nil {
		m.DiskUsedBytes = diskInfo.Used
		m.DiskTotalBytes = diskInfo.Total
	}

	// retea
	netStats, err := net.IOCounters(false)
	if err == nil && len(netStats) > 0 {
		m.NetInBytes = netStats[0].BytesRecv
		m.NetOutBytes = netStats[0].BytesSent
	}

	// load average
	loadInfo, err := load.Avg()
	if err == nil {
		m.LoadAvg1 = loadInfo.Load1
		m.LoadAvg5 = loadInfo.Load5
		m.LoadAvg15 = loadInfo.Load15
	}

	// top procese dupa CPU
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

		// sorteaza dupa CPU (simplu bubble sort pt top 5)
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

	return m, nil
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

	// info OS
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

	// porturi listening
	conns, err := net.Connections("inet")
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

	// useri din /etc/passwd
	inv.Users = getSystemUsers()

	// pachete instalate (dpkg pt Debian/Ubuntu)
	inv.Packages = getInstalledPackages()

	// servicii active (systemctl)
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

	// incearca dpkg (Debian/Ubuntu)
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

	// incearca rpm (RHEL/CentOS)
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
