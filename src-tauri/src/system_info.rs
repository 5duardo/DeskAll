use serde::Serialize;
use sysinfo::{Disks, System};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuInfo {
    pub brand: String,
    pub frequency_mhz: u64,
    pub physical_cores: Option<usize>,
    pub logical_cores: usize,
    /// Global CPU usage 0–100
    pub usage: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryInfo {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub available_bytes: u64,
    pub swap_total_bytes: u64,
    pub swap_used_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub name: String,
    pub mount_point: String,
    pub file_system: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub is_removable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub hostname: String,
    pub os_name: String,
    pub os_version: String,
    pub kernel_version: String,
    pub arch: String,
    pub uptime_secs: u64,
    pub boot_time_secs: u64,
    pub cpu: CpuInfo,
    pub memory: MemoryInfo,
    pub disks: Vec<DiskInfo>,
}

pub fn collect() -> SystemInfo {
    let mut sys = System::new();
    sys.refresh_memory();
    sys.refresh_cpu_all();

    // First sample of CPU usage is often 0; refresh again after a short wait.
    std::thread::sleep(std::time::Duration::from_millis(200));
    sys.refresh_cpu_all();

    let hostname = System::host_name().unwrap_or_else(|| "—".into());
    let os_name = System::name().unwrap_or_else(|| std::env::consts::OS.into());
    let os_version = System::os_version().unwrap_or_else(|| "—".into());
    let kernel_version = System::kernel_version().unwrap_or_else(|| "—".into());

    let cpus = sys.cpus();
    let brand = cpus
        .first()
        .map(|c| c.brand().trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "—".into());
    let frequency_mhz = cpus.first().map(|c| c.frequency()).unwrap_or(0);
    let logical_cores = cpus.len().max(1);
    let usage = sys.global_cpu_usage();

    let disks = Disks::new_with_refreshed_list()
        .list()
        .iter()
        .filter(|d| d.total_space() > 0)
        .map(|d| DiskInfo {
            name: {
                let n = d.name().to_string_lossy().trim().to_string();
                if n.is_empty() {
                    d.mount_point().to_string_lossy().into_owned()
                } else {
                    n
                }
            },
            mount_point: d.mount_point().to_string_lossy().into_owned(),
            file_system: d.file_system().to_string_lossy().into_owned(),
            total_bytes: d.total_space(),
            available_bytes: d.available_space(),
            is_removable: d.is_removable(),
        })
        .collect();

    SystemInfo {
        hostname,
        os_name,
        os_version,
        kernel_version,
        arch: std::env::consts::ARCH.into(),
        uptime_secs: System::uptime(),
        boot_time_secs: System::boot_time(),
        cpu: CpuInfo {
            brand,
            frequency_mhz,
            physical_cores: System::physical_core_count(),
            logical_cores,
            usage,
        },
        memory: MemoryInfo {
            total_bytes: sys.total_memory(),
            used_bytes: sys.used_memory(),
            available_bytes: sys.available_memory(),
            swap_total_bytes: sys.total_swap(),
            swap_used_bytes: sys.used_swap(),
        },
        disks,
    }
}
