/**
 * Hàm chuyển đổi Tab  isCreateMapMode che_do_tao_ban_do
 */
function openTab(event, tabId) {
    // Ẩn tất cả các tab content
    const tabContents = document.getElementsByClassName("tab-content");
    for (let i = 0; i < tabContents.length; i++) {
        tabContents[i].classList.remove("active");
    }

    // Bỏ trạng thái active của tất cả các nút
    const tabButtons = document.getElementsByClassName("tab-btn");
    for (let i = 0; i < tabButtons.length; i++) {
        tabButtons[i].classList.remove("active");
    }

    // Hiển thị tab hiện tại và thêm class active vào nút đã nhấn
    document.getElementById(tabId).classList.add("active");
    event.currentTarget.classList.add("active");

    if (tabId === 'mappingTab') {
        initMappingCanvas();
    }
}

/**
 * Hàm dùng chung để gửi yêu cầu cập nhật lên server
 */
async function postUpdate(key, value) {
    try {
        const response = await fetch('/api/update_config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value })
        });
        return await response.json();
    } catch (error) {
        console.error("Lỗi cập nhật config:", error);
    }
}

function toggleRunStop() {
    const newState = window.currentRunState === 0 ? 1 : 0;
    postUpdate('run_state', newState);
}

function triggerSpeaker() {
    const btn = document.getElementById('btn-speaker');
    btn.classList.add('active');
    
    // Gửi tín hiệu lên 1
    postUpdate('loa_state', 1);

    // Sau 2 giây chuyển màu lại nhưng không cần gửi lại 0 về config (theo yêu cầu)
    setTimeout(() => {
        btn.classList.remove('active');
    }, 2000);
}

function toggleMotor() {
    const newState = !window.currentMotorState;
    postUpdate('motor_state', newState);
}

async function toggleLidarView(event) {
    const btn = event.currentTarget;
    const isActive = btn.classList.contains('btn-lidar-on');
    const newState = !isActive;

    const response = await fetch('/api/toggle_lidar_view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState })
    });

    if (response.ok) {
        btn.classList.toggle('btn-lidar-on', newState);
        btn.classList.toggle('btn-lidar-off', !newState);
        const icon = btn.querySelector('i');
        icon.className = `fa-solid ${newState ? 'fa-eye' : 'fa-eye-slash'}`;
    }
}

function updateVelocity(key, value) {
    postUpdate(key, parseInt(value));
}

/**
 * Hàm cập nhật config chung cho chuỗi (String)
 */
function updateConfig(key, value) {
    postUpdate(key, value).then((response) => {
        if (key === 'ten_danh_sach_diem' && response?.danh_sach_diem) {
            // Cập nhật cache điểm và vẽ lại các marker mà không cần tải lại toàn bộ trang
            window.pointsCache = response.danh_sach_diem;
            if (window.refreshMarkers) {
                window.refreshMarkers(window.pointsCache);
            }
            // Cần vẽ lại cả đường đi vì vị trí các điểm có thể đã thay đổi
            if (window.refreshPaths && window.pathsCache) {
                window.refreshPaths(window.pathsCache);
            }
        } else if (key === 'ten_danh_sach_duong' && response?.danh_sach_duong) {
            // Cập nhật cache đường và vẽ lại
            window.pathsCache = response.danh_sach_duong;
            if (window.refreshPaths) {
                window.refreshPaths(window.pathsCache);
            }
        } else {
            window.location.reload(); // Các thay đổi khác (ví dụ: đổi bản đồ) vẫn cần tải lại trang
        }
    });
}

/**
 * Logic Thêm Điểm
 */
let isAddPointMode = window.initialAddMode || false;
let isEditPointMode = window.initialEditMode || false;
let isAddPathMode = window.initialAddPathMode || false;
let isDelPathMode = window.initialDelPathMode || false;
let isAdjustPosMode = false;
let isSelectDeleteAreaMode = false;
let isLidarEditMode = false;
let isCreateMapMode = window.initialCreateMapMode || false;

// Khởi tạo trạng thái điều khiển thủ công
let manualControlState = window.initialManualControl || { dieu_khien_thu_cong: false, tien: 0, lui: 0, trai: 0, phai: 0, ha_xe: 0, nang_xe: 0 };
let manualHeartbeatInterval = null; // Quản lý nhịp tim gửi lệnh liên tục

window.mappingNeedsFullReload = false; // Flag đánh dấu cần nạp lại toàn bộ bản đồ mapping
let currentMapW = window.mapWidth || 0;
let currentMapH = window.mapHeight || 0;
let lastMapRefreshTime = 0;
const MAP_REFRESH_INTERVAL = 1000; // Cập nhật bản đồ mỗi 1 giây khi mapping

let currentEditingName = null; // Lưu tên cũ khi đang sửa
let firstPointForPath = null; // Lưu điểm thứ nhất khi đang tạo đường
let secondPointForPath = null; // Lưu điểm thứ hai khi chờ chọn điểm uốn
let firstCornerForDelete = null; // Lưu góc thứ nhất của hình chữ nhật xóa

// Biến quản lý Zoom/Pan cho Mapping
let mapScale = 1;
let mapPanX = 0;
let mapPanY = 0;
let isPanning = false;
let startPanMouse = { x: 0, y: 0 };

// pointsCache được khởi tạo trong home.html từ Jinja2
if (!window.pointsCache) window.pointsCache = {};
if (!window.pathsCache) window.pathsCache = {};
if (!window.deleteAreasCache) window.deleteAreasCache = [];

window.handlePathCreation = function(clickedPointName, clickPos) {
    const isCurveMode = document.getElementById('check-is-curve').checked;

    if (!clickedPointName) return; // Chỉ xử lý khi click vào điểm đã có

    if (!firstPointForPath) {
        firstPointForPath = clickedPointName;
        console.log("Chọn điểm đầu:", firstPointForPath);
        return;
    }

    if (!secondPointForPath) {
        if (clickedPointName === firstPointForPath) return;
        secondPointForPath = clickedPointName;
        console.log("Chọn điểm cuối:", secondPointForPath);

        if (!isCurveMode) {
            const name = `${firstPointForPath}_${secondPointForPath}`;
            addPathToServer(name, [firstPointForPath, secondPointForPath], null);
            firstPointForPath = null;
            secondPointForPath = null;
        } else {
            console.log("Hãy chọn điểm thứ 3 làm điểm kiểm soát đường cong.");
        }
        return;
    }

    // Nếu đã có điểm 1 và 2, và đang ở chế độ đường cong
    if (isCurveMode) {
        const controlPointName = clickedPointName;
        const name = `${firstPointForPath}_${secondPointForPath}`;
        addPathToServer(name, [firstPointForPath, secondPointForPath], controlPointName);
        firstPointForPath = null;
        secondPointForPath = null;
    }
};

async function addPathToServer(name, nodes, controlPoint) {
    const response = await fetch('/api/add_path_temp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, nodes, control_point: controlPoint })
    });
    if (response.ok) {
        const result = await response.json();
        window.pathsCache[name] = result.new_path;
        window.addPathLine(name, nodes[0], nodes[1], result.new_path[1], controlPoint);
    }
}

/**
 * Logic điều khiển thủ công
 */
async function setControlMode(isManual) {
    manualControlState.dieu_khien_thu_cong = isManual;
    const pad = document.getElementById('manual-control-pad');
    if (pad) pad.style.display = isManual ? 'flex' : 'none';
    
    // Reset tất cả các hướng về 0 khi chuyển chế độ
    manualControlState.tien = 0;
    manualControlState.lui = 0;
    manualControlState.trai = 0;
    manualControlState.phai = 0;
    manualControlState.ha_xe = 0;
    manualControlState.nang_xe = 0;

    // Xóa class active của các nút chức năng mới
    ['nang_xe', 'ha_xe'].forEach(action => {
        const btn = document.getElementById(`ctrl-${action}`);
        if (btn) btn.classList.remove('btn-active');
    });

    // Quản lý Heartbeat: Gửi lệnh liên tục mỗi 200ms khi ở chế độ thủ công
    if (isManual) {
        if (!manualHeartbeatInterval) {
            manualHeartbeatInterval = setInterval(postManualControl, 200);
        }
    } else {
        if (manualHeartbeatInterval) {
            clearInterval(manualHeartbeatInterval);
            manualHeartbeatInterval = null;
        }
    }

    // Cập nhật UI nút bấm
    document.querySelectorAll('.pad-btn').forEach(btn => btn.classList.remove('active'));
    
    await postManualControl();
}

function toggleManualAction(action) {
    if (!manualControlState.dieu_khien_thu_cong) return;

    // Đảo trạng thái 0 <-> 1
    manualControlState[action] = manualControlState[action] === 0 ? 1 : 0;

    // Cập nhật màu sắc dựa trên class 'btn-active' (màu cam giống các nút khác)
    const btn = document.getElementById(`ctrl-${action}`);
    if (btn) {
        btn.classList.toggle('btn-active', manualControlState[action] === 1);
    }

    // Gửi lệnh ngay lập tức lên server
    postManualControl();
}


function updateDirection(dir, val) {
    if (!manualControlState.dieu_khien_thu_cong) return;
    if (manualControlState[dir] === val) return; // Tránh gửi lặp nếu trạng thái không đổi

    manualControlState[dir] = val;
    
    // Hiệu ứng visual cho nút bấm
    const btn = document.getElementById(`ctrl-${dir}`);
    if (btn) {
        if (val === 1) btn.classList.add('active');
        else btn.classList.remove('active');
    }

    postManualControl();
}

/**
 * Gửi toàn bộ trạng thái điều khiển thủ công hiện tại lên server
 */
async function postManualControl() {
    try {
        await fetch('/api/manual_control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(manualControlState)
        });
    } catch (e) {
        console.error("Lỗi gửi lệnh điều khiển thủ công:", e);
    }
}

async function toggleTempResetLidar(event) {
    const btn = event.currentTarget;
    const isActive = btn.classList.contains('btn-active');
    const newState = !isActive;

    const response = await postUpdate('tam_thoi_reset_vung_loai_bo', newState);
    if (response?.status === 'success') {
        btn.classList.toggle('btn-active', newState);
    }
}

// Xử lý sự kiện bàn phím
document.addEventListener('keydown', (e) => {
    // Không xử lý nếu đang gõ vào ô input hoặc không ở chế độ thủ công
    if (e.target.tagName === 'INPUT' || !manualControlState.dieu_khien_thu_cong) return;

    switch(e.key) {
        case "ArrowUp":    updateDirection('tien', 1); e.preventDefault(); break;
        case "ArrowDown":  updateDirection('lui', 1);  e.preventDefault(); break;
        case "ArrowLeft":  updateDirection('trai', 1); e.preventDefault(); break;
        case "ArrowRight": updateDirection('phai', 1); e.preventDefault(); break;
    }
});

document.addEventListener('keyup', (e) => {
    if (!manualControlState.dieu_khien_thu_cong) return;

    switch(e.key) {
        case "ArrowUp":    updateDirection('tien', 0); break;
        case "ArrowDown":  updateDirection('lui', 0);  break;
        case "ArrowLeft":  updateDirection('trai', 0); break;
        case "ArrowRight": updateDirection('phai', 0); break;
    }
});

/**
 * Chức năng tạo bản đồ mới
 */
function toggleCreateMapMode() {
    isCreateMapMode = !isCreateMapMode;
    if (isCreateMapMode) window.mappingNeedsFullReload = true;
    const btn = document.getElementById('btn-create-map-mode-tab');
    const controls = document.getElementById('mapping-active-controls');
    
    // Đổi màu nút (xanh/đỏ) và đổi nội dung chữ
    btn.classList.toggle('btn-run', !isCreateMapMode);
    btn.classList.toggle('btn-stop', isCreateMapMode);
    btn.querySelector('span').innerText = isCreateMapMode ? 'Dừng quét' : 'Bắt đầu quét';
    
    // Ẩn/Hiện khung Tạm dừng và Lưu bản đồ
    if (controls) {
        controls.style.display = isCreateMapMode ? 'flex' : 'none';
    }

    // Gửi cập nhật trạng thái lên Server
    postUpdate('che_do_tao_ban_do', isCreateMapMode);
}

async function togglePauseCreateMap() {
    const response = await fetch('/api/map/toggle_pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });
    if (response.ok) {
        const result = await response.json();
        const btn = document.getElementById('btn-pause-map-tab');
        const icon = btn.querySelector('i');
        const span = btn.querySelector('span');
        
        icon.className = `fa-solid ${result.paused ? 'fa-play' : 'fa-pause'}`;
        span.innerText = result.paused ? 'Tiếp tục' : 'Tạm dừng';
    }
}

async function toggleUpdateAllPoints(event) {
    const btn = event.currentTarget;
    const isActive = btn.classList.contains('btn-active');
    const newState = !isActive;

    // Sử dụng API chung để cập nhật biến trong config.py
    const response = await postUpdate('update_all_point_in_map', newState);
    if (response?.status === 'success') {
        btn.classList.toggle('btn-active', newState);
    }
}

function updateNewMapName(value) {
    postUpdate('ten_ban_do_moi', value);
}

async function saveNewMap() {
    const name = document.getElementById('new-map-name-tab').value.trim();
    if (!name) return alert("Vui lòng nhập tên bản đồ");
    
    const response = await fetch('/api/map/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });
    if (response.ok) {
        alert("Đã gửi lệnh lưu bản đồ: " + name);
    }
}

/**
 * Quản lý Mapping Canvas
 */
let mappingCanvas, mappingCtx, uiCanvas, uiCtx;
let isMappingLoading = false; // Khóa để tránh nạp chồng chéo
let baseMapLoaded = false;

function initMappingCanvas() {
    mappingCanvas = document.getElementById('mapping-canvas');
    uiCanvas = document.getElementById('mapping-ui-canvas');
    if (!mappingCanvas || !uiCanvas) return;

    mappingCtx = mappingCanvas.getContext('2d');
    uiCtx = uiCanvas.getContext('2d');

    mappingCanvas.width = window.mapWidth || 5000;
    mappingCanvas.height = window.mapHeight || 5000;
    uiCanvas.width = mappingCanvas.width;
    uiCanvas.height = mappingCanvas.height;

    // Tải toàn bộ bản đồ gốc một lần duy nhất
    const img = new Image();
    img.src = '/api/map_image?source=mapping&v=' + Date.now();
    img.onload = () => {
        mappingCtx.drawImage(img, 0, 0);
        baseMapLoaded = true;
        resetZoom(); // Căn chỉnh bản đồ vừa khung khi mới nạp
    };

    // Xử lý Zoom bằng cuộn chuột
    uiCanvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomSpeed = 0.1;
        const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
        const oldScale = mapScale;
        mapScale = Math.min(Math.max(0.1, mapScale + delta), 10);

        // Tính toán để zoom vào vị trí con trỏ chuột
        const rect = uiCanvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Tọa độ thực trên canvas trước khi zoom
        const worldX = (mouseX / oldScale);
        const worldY = (mouseY / oldScale);

        // Điều chỉnh Pan để giữ vị trí chuột
        mapPanX -= worldX * (mapScale - oldScale);
        mapPanY -= worldY * (mapScale - oldScale);

        updateMapTransform();
    }, { passive: false });

    // Xử lý Pan và Click
    uiCanvas.addEventListener('mousedown', (event) => {
        if (isSelectDeleteAreaMode) {
            // Nếu đang chế độ chọn vùng, xử lý tọa độ thực
            const rect = uiCanvas.getBoundingClientRect();
            
            // Tỉ lệ chính xác giữa độ phân giải bản đồ và kích thước hiển thị trên màn hình
            // (rect.width đã bao gồm cả hiệu ứng của mapScale và CSS max-width)
            const x = (event.clientX - rect.left) * (uiCanvas.width / rect.width);
            const y = (event.clientY - rect.top) * (uiCanvas.height / rect.height);

            if (!firstCornerForDelete) {
                firstCornerForDelete = { x, y };
            } else {
                const area = [
                    Math.round(firstCornerForDelete.x),
                    Math.round(firstCornerForDelete.y),
                    Math.round(x),
                    Math.round(y)
                ];
                addDeleteAreaToServer(area);
                firstCornerForDelete = null;
            }
        } else {
            // Chế độ di chuyển bản đồ
            isPanning = true;
            startPanMouse = { x: event.clientX, y: event.clientY };
            uiCanvas.style.cursor = 'grabbing';
        }
    });

    window.addEventListener('mousemove', (event) => {
        if (!isPanning) return;
        const dx = event.clientX - startPanMouse.x;
        const dy = event.clientY - startPanMouse.y;
        
        mapPanX += dx;
        mapPanY += dy;
        
        startPanMouse = { x: event.clientX, y: event.clientY };
        updateMapTransform();
    });

    window.addEventListener('mouseup', () => {
        isPanning = false;
        if (uiCanvas) uiCanvas.style.cursor = isSelectDeleteAreaMode ? 'crosshair' : 'grab';
    });
}

/**
 * Cập nhật CSS transform cho wrapper
 */
function updateMapTransform() {
    const wrapper = document.querySelector('.canvas-wrapper');
    if (wrapper) {
        wrapper.style.transform = `translate(${mapPanX}px, ${mapPanY}px) scale(${mapScale})`;
    }
}

/**
 * Reset bản đồ về vị trí trung tâm
 */
function resetZoom() {
    const container = document.querySelector('.mapping-view-container');
    if (container && mappingCanvas) {
        const rect = uiCanvas.getBoundingClientRect();
        const parentRect = container.getBoundingClientRect();
        
        mapScale = Math.min(parentRect.width / mappingCanvas.width, parentRect.height / mappingCanvas.height) * 0.9;
        mapPanX = (parentRect.width - mappingCanvas.width * mapScale) / 2;
        mapPanY = (parentRect.height - mappingCanvas.height * mapScale) / 2;
        
        updateMapTransform();
    }
}

async function updateMappingCanvas(data) {
    if (!mappingCanvas || !uiCanvas) return;

    // Đảm bảo kích thước Canvas luôn khớp với kích thước bản đồ thực tế từ Server
    if (mappingCanvas.width !== data.w_pixel || mappingCanvas.height !== data.h_pixel) {
        console.log(`Resizing Mapping Canvas: ${data.w_pixel}x${data.h_pixel}`);
        
        // Đồng bộ tỷ lệ khung hình cho wrapper để CSS xử lý việc co dãn chính xác
        const wrapper = document.querySelector('.canvas-wrapper');
        if (wrapper) {
            wrapper.style.aspectRatio = `${data.w_pixel} / ${data.h_pixel}`;
        }

        mappingCanvas.width = data.w_pixel;
        mappingCanvas.height = data.h_pixel;
        uiCanvas.width = data.w_pixel;
        uiCanvas.height = data.h_pixel;
        
        // Khi resize, nội dung canvas bị xóa, cần nạp lại ảnh nền
        baseMapLoaded = false;
        const img = new Image();
        img.src = '/api/map_image?source=mapping&v=' + Date.now();
        img.onload = () => {
            mappingCtx.drawImage(img, 0, 0);
            baseMapLoaded = true;
        };
        return; // Đợi nạp xong ảnh ở vòng lặp sau mới vẽ tiếp
    }

    if (!baseMapLoaded) return;

    const agvX = Math.round(data.toa_do_agv_pixel[0]);
    const agvY = Math.round(data.toa_do_agv_pixel[1]);

    // 1. CẬP NHẬT BẢN ĐỒ (Persistent Layer) - Chỉ chạy khi đang trong chế độ Mapping
    if (isCreateMapMode && !data.trang_thai_tam_dung_tao_ban_do && !isMappingLoading) {
        isMappingLoading = true;
        const w_up = window.mappingUpdateSize[0];
        const h_up = window.mappingUpdateSize[1];
        const x1 = Math.max(0, agvX - w_up / 2);
        const y1 = Math.max(0, agvY - h_up / 2);

        const regionImg = new Image();
        regionImg.src = `/api/map_region?x=${agvX}&y=${agvY}&v=${Date.now()}`;
        regionImg.onload = () => {
            mappingCtx.drawImage(regionImg, x1, y1);
            isMappingLoading = false;
        };
        regionImg.onerror = () => { isMappingLoading = false; };
    }

    // 2. VẼ UI (AGV, Lidar...) - Clear và vẽ lại mỗi giây trên lớp UI
    uiCtx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
    
    // Vẽ AGV Marker
    const heading = data.huong_agv_do_img;
    uiCtx.fillStyle = "rgba(52, 152, 219, 0.9)";
    uiCtx.strokeStyle = "#ffffff";
    uiCtx.lineWidth = 5;
    uiCtx.save();
    uiCtx.translate(agvX, agvY);
    uiCtx.rotate(-(heading * Math.PI / 180));
    uiCtx.fillRect(-data.kich_thuoc_agv[0]/2, -data.kich_thuoc_agv[1]/2, data.kich_thuoc_agv[0], data.kich_thuoc_agv[1]);
    uiCtx.strokeRect(-data.kich_thuoc_agv[0]/2, -data.kich_thuoc_agv[1]/2, data.kich_thuoc_agv[0], data.kich_thuoc_agv[1]);

    // Vẽ mũi tên hướng (Heading Arrow) tương tự như ở tab Home
    // Thân mũi tên (màu cam)
    uiCtx.beginPath();
    uiCtx.strokeStyle = "#e67e22"; 
    uiCtx.lineWidth = 3;
    uiCtx.moveTo(0, 0);
    uiCtx.lineTo(25, 0); 
    uiCtx.stroke();

    // Đầu mũi tên (màu xanh dương)
    uiCtx.beginPath();
    uiCtx.fillStyle = "#3498db";
    uiCtx.moveTo(25, -6);
    uiCtx.lineTo(35, 0);
    uiCtx.lineTo(25, 6);
    uiCtx.fill();

    uiCtx.restore();

    // Vẽ thêm các điểm Lidar thời gian thực lên lớp UI
    if (data.danh_sach_diem_lidar && data.danh_sach_diem_lidar.length > 0) {
        // uiCtx.fillStyle = "rgba(255, 20, 147, 0.5)"; // Màu hồng cũ
        uiCtx.fillStyle = "rgba(255, 255, 0, 0.7)"; // Chuyển sang màu vàng (Yellow) để dễ nhìn hơn trên nền tối
        data.danh_sach_diem_lidar.forEach(pt => {
            uiCtx.beginPath();
            uiCtx.arc(pt[0], pt[1], 4, 0, 2 * Math.PI);
            uiCtx.fill();
        });
    }

    // 3. Vẽ các vùng xóa bản đồ đã chọn (Màu đỏ mờ)
    if (window.deleteAreasCache && window.deleteAreasCache.length > 0) {
        uiCtx.fillStyle = "rgba(231, 76, 60, 0.4)";
        uiCtx.strokeStyle = "#e74c3c";
        uiCtx.lineWidth = 2;
        window.deleteAreasCache.forEach(area => {
            const x = Math.min(area[0], area[2]);
            const y = Math.min(area[1], area[3]);
            const w = Math.abs(area[2] - area[0]);
            const h = Math.abs(area[3] - area[1]);
            uiCtx.fillRect(x, y, w, h);
            uiCtx.strokeRect(x, y, w, h);
        });
    }
}

/**
 * Chức năng loại bỏ chân xe Lidar
 */
async function toggleLidarSampling(event) {
    const btn = event.currentTarget;
    const isActive = btn.classList.contains('btn-active');
    const newState = !isActive;

    // Đổi màu nút ngay lập tức
    btn.classList.toggle('btn-active', newState);

    await fetch('/api/loai_bo_chan_xe/toggle_sampling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState })
    });
}

function toggleLidarEditMode() {
    isLidarEditMode = !isLidarEditMode;
    const btn = document.getElementById('btn-lidar-edit');
    const container = document.getElementById('lidar-edit-container');
    btn.classList.toggle('btn-active', isLidarEditMode);
    container.style.display = isLidarEditMode ? 'grid' : 'none';

    if (isLidarEditMode) {
        updateStatusUI(); // Cập nhật ngay các ô input khi mở chế độ chỉnh sửa
    }
}

/**
 * Tạo hoặc cập nhật các ô input cho vùng chân xe
 */
function updateLidarInputs(zones) {
    const container = document.getElementById('lidar-edit-container');
    if (!container || !isLidarEditMode) return;

    // Kiểm tra số lượng input hiện tại so với dữ liệu mới để quyết định có vẽ lại không
    const currentInputCount = container.querySelectorAll('input').length;
    const requiredInputCount = zones.reduce((acc, zone) => acc + zone.length, 0);

    if (currentInputCount !== requiredInputCount) {
        container.innerHTML = '';
    }

    // Nếu chưa có input thì tạo mới
    if (container.children.length === 0) {
        zones.forEach((zone, zIdx) => {
            zone.forEach((val, vIdx) => {
                const input = document.createElement('input');
                input.type = 'number';
                input.value = val;
                input.dataset.zone = zIdx;
                input.dataset.idx = vIdx;
                input.onchange = () => syncLidarMm();
                container.appendChild(input);
            });
        });
    } else {
        // Nếu đang có thì chỉ cập nhật giá trị (nếu người dùng không đang focus)
        const inputs = container.querySelectorAll('input');
        let i = 0;
        zones.forEach(zone => zone.forEach(val => {
            if (document.activeElement !== inputs[i]) {
                inputs[i].value = val;
            }
            i++;
        }));
    }
}

async function syncLidarMm() {
    const inputs = document.querySelectorAll('#lidar-edit-container input');
    const zones = [[], [], [], []];
    inputs.forEach(input => {
        const z = parseInt(input.dataset.zone);
        zones[z].push(parseInt(input.value) || 0);
    });

    await fetch('/api/loai_bo_chan_xe/update_mm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zones: zones })
    });
}

async function saveLidarZone() {
    const name = document.getElementById('lidar-file-name').value.trim();
    if (!name) return alert("Vui lòng nhập tên file");

    const response = await fetch('/api/loai_bo_chan_xe/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name })
    });

    if (response.ok) {
        const result = await response.json();
        // Cập nhật lại Combobox để người dùng thấy file mới ngay lập tức
        const select = document.getElementById('select-lidar-zone');
        if (select && result.danh_sach) {
            // Giữ lại option placeholder đầu tiên
            const placeholder = select.options[0];
            select.innerHTML = '';
            select.appendChild(placeholder);
            
            result.danh_sach.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v;
                opt.text = v;
                if (v === name) opt.selected = true;
                select.appendChild(opt);
            });
        }
        alert("Đã tạo file JSON lưu vùng chân xe: " + name);
    }
}

async function loadLidarZone(name) {
    if (!name) return;

    const response = await fetch('/api/loai_bo_chan_xe/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name })
    });

    if (response.ok) {
        const result = await response.json();
        if (result.vung_moi) {
            updateLidarInputs(result.vung_moi);
        }
    }
}

/**
 * Chức năng Kiểm tra vị trí xe
 */
async function toggleCheckPos(event) {
    const btn = event.currentTarget;
    const isActive = btn.classList.contains('btn-active');
    const newState = !isActive;
    
    btn.classList.toggle('btn-active', newState);
    await fetch('/api/toggle_check_pos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState })
    });
}

function selectMappingMode(mode) {
    const isMoi = mode === 'tao_ban_do_moi';
    const currentVal = isMoi ? window.isTaoMoi : window.isChinhSua;
    
    if (currentVal) {
        // Nếu nhấn vào nút đang active thì tắt đi
        postUpdate('tao_ban_do_moi', false);
        postUpdate('chinh_sua_ban_do', false);
        // Nếu đang quét thì dừng luôn
        if (isCreateMapMode) toggleCreateMapMode();
    } else {
        postUpdate('tao_ban_do_moi', isMoi);
        postUpdate('chinh_sua_ban_do', !isMoi);
    }
}

/**
 * Chức năng Xóa vùng bản đồ
 */
function toggleDeleteAreaMode() {
    isSelectDeleteAreaMode = !isSelectDeleteAreaMode;
    const btn = document.getElementById('btn-select-delete-area');
    btn.classList.toggle('btn-active', isSelectDeleteAreaMode);
    firstCornerForDelete = null;
}

async function addDeleteAreaToServer(area) {
    const response = await fetch('/api/xoa_vung_ban_do/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area })
    });
    if (response.ok) {
        window.deleteAreasCache.push(area);
        if (window.refreshDeleteAreas) window.refreshDeleteAreas(window.deleteAreasCache);
    }
}

async function updateDeleteArea(event) {
    const btn = event.currentTarget;
    const originalClass = btn.className;
    btn.classList.add('btn-active');
    
    await fetch('/api/xoa_vung_ban_do/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });

    setTimeout(() => {
        btn.className = originalClass;
    }, 2000);
}

async function clearDeleteAreas() {
    if (!confirm("Xóa tất cả các vùng đã chọn?")) return;
    const response = await fetch('/api/xoa_vung_ban_do/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });
    if (response.ok) {
        window.deleteAreasCache = [];
        if (window.refreshDeleteAreas) window.refreshDeleteAreas([]);
    }
}

/**
 * Chế độ điều chỉnh vị trí thủ công
 */
function toggleAdjustPosMode() {
    isAdjustPosMode = !isAdjustPosMode;
    const btn = document.getElementById('btn-adjust-pos');
    btn.classList.toggle('btn-active', isAdjustPosMode);
    
    if (!isAdjustPosMode && window.removeGhostMarker) {
        window.removeGhostMarker();
    }
    
    // Gửi flag update_tam_thoi lên server
    postManualUpdate({ update_tam_thoi: isAdjustPosMode });
}

window.handleMapClickManualPos = function(x, y) {
    document.getElementById('man-x').value = Math.round(x);
    document.getElementById('man-y').value = Math.round(y);
    // Giữ nguyên góc hiện tại hoặc mặc định 0 nếu chưa có
    if(!document.getElementById('man-h').value) document.getElementById('man-h').value = 0;
    syncManualPos();
};

function syncManualPos() {
    const x = parseInt(document.getElementById('man-x').value) || 0;
    const y = parseInt(document.getElementById('man-y').value) || 0;
    const h = parseFloat(document.getElementById('man-h').value) || 0;
    
    // Vẽ ghost marker để người dùng xem trước
    if (window.updateAGVPosition) {
        // Sử dụng kích thước AGV hiện tại từ cache hoặc mặc định
        window.updateAGVPosition(x, y, h, [50, 30], true); 
    }
    
    postManualUpdate({ toa_do: [x, y], huong: h });
}

async function confirmManualPos() {
    if (!confirm("Xác nhận cập nhật vị trí mới cho AGV?")) return;
    await postManualUpdate({ update: true });
    toggleAdjustPosMode(); // Tắt chế độ sau khi xác nhận
}

async function postManualUpdate(data) {
    try {
        await fetch('/api/update_manual_pos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (e) { console.error("Lỗi cập nhật manual pos:", e); }
}

function toggleAddPointMode() {
    isAddPointMode = !isAddPointMode;
    if (isAddPointMode) {
        isEditPointMode = false;
        document.getElementById('btn-edit-point').classList.remove('btn-active');
    }
    const btn = document.getElementById('btn-add-point');
    btn.classList.toggle('btn-active', isAddPointMode);
    postUpdate('che_do_them_diem', isAddPointMode);
    postUpdate('che_do_sua_diem', false);
}

function toggleAddPathMode() {
    isAddPathMode = !isAddPathMode;
    if (isAddPathMode) {
        isDelPathMode = false;
        isAddPointMode = false;
        isEditPointMode = false;
        firstPointForPath = null;
        document.getElementById('btn-del-path').classList.remove('btn-active');
        document.getElementById('btn-add-point').classList.remove('btn-active');
        document.getElementById('btn-edit-point').classList.remove('btn-active');
    }
    document.getElementById('btn-add-path').classList.toggle('btn-active', isAddPathMode);
    postUpdate('che_do_them_duong', isAddPathMode);
    postUpdate('che_do_xoa_duong', false);
}

function toggleDelPathMode() {
    isDelPathMode = !isDelPathMode;
    if (isDelPathMode) {
        isAddPathMode = false;
        isAddPointMode = false;
        isEditPointMode = false;
        document.getElementById('btn-add-path').classList.remove('btn-active');
        document.getElementById('btn-add-point').classList.remove('btn-active');
        document.getElementById('btn-edit-point').classList.remove('btn-active');
    }
    document.getElementById('btn-del-path').classList.toggle('btn-active', isDelPathMode);
    postUpdate('che_do_xoa_duong', isDelPathMode);
    postUpdate('che_do_them_duong', false);
}

function toggleEditPointMode() {
    isEditPointMode = !isEditPointMode;
    if (isEditPointMode) {
        isAddPointMode = false;
        document.getElementById('btn-add-point').classList.remove('btn-active');
    }
    const btn = document.getElementById('btn-edit-point');
    btn.classList.toggle('btn-active', isEditPointMode);
    postUpdate('che_do_sua_diem', isEditPointMode);
    postUpdate('che_do_them_diem', false);
}

function openPointModal(x, y, existingName = null) {
    currentEditingName = existingName;
    const deleteBtn = document.getElementById('m-btn-delete');
    
    document.getElementById('m-point-x').value = Math.round(x);
    document.getElementById('m-point-y').value = Math.round(y);
    
    if (existingName && window.pointsCache[existingName]) {
        const data = window.pointsCache[existingName];
        document.getElementById('m-point-name').value = existingName;
        document.getElementById('m-point-type').value = data[2];
        document.getElementById('m-point-heading').value = data[3];
        toggleHeadingInput(data[2]);
        deleteBtn.style.display = 'block';
    } else {
        document.getElementById('m-point-name').value = "";
        document.getElementById('m-point-type').value = "không hướng";
        document.getElementById('m-point-heading').value = "0.0";
        toggleHeadingInput("không hướng");
        deleteBtn.style.display = 'none';
    }
    
    document.getElementById('point-modal').style.display = 'flex';
}

function closePointModal() {
    document.getElementById('point-modal').style.display = 'none';
    currentEditingName = null;
}

function toggleHeadingInput(val) {
    document.getElementById('heading-group').style.display = (val === 'có hướng') ? 'flex' : 'none';
}

async function saveNewPoint() {
    const name = document.getElementById('m-point-name').value;
    const x = parseInt(document.getElementById('m-point-x').value);
    const y = parseInt(document.getElementById('m-point-y').value);
    const type = document.getElementById('m-point-type').value;
    const heading = parseFloat(document.getElementById('m-point-heading').value);

    if (!name) return alert("Vui lòng nhập tên điểm");

    // Nếu đổi tên khi đang sửa, phải xóa tên cũ ở server và cache
    if (currentEditingName && currentEditingName !== name) {
        const delRes = await fetch('/api/delete_point_temp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: currentEditingName })
        });
        if (delRes.ok) {
            const delData = await delRes.json();
            window.pathsCache = delData.danh_sach_duong || window.pathsCache;
            if (window.refreshPaths) window.refreshPaths(window.pathsCache);
            delete window.pointsCache[currentEditingName];
            if (window.removeMarker) window.removeMarker(currentEditingName);
        }
    }

    const response = await fetch('/api/add_point_temp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, info: [x, y, type, heading] })
    });

    if (response.ok) {
        window.pointsCache[name] = [x, y, type, heading];
        // Xóa marker cũ nếu có và vẽ lại
        if (window.removeMarker) window.removeMarker(name);
        drawPointOnMap(name, x, y, type, heading);
        closePointModal();
    }
}

async function deletePoint() {
    if (!currentEditingName) return;
    if (!confirm(`Bạn có chắc muốn xóa điểm ${currentEditingName}?`)) return;

    const response = await fetch('/api/delete_point_temp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: currentEditingName })
    });

    if (response.ok) {
        const result = await response.json();
        // Cập nhật lại cache đường đi và vẽ lại nếu có đường bị xóa tự động
        if (result.danh_sach_duong) {
            window.pathsCache = result.danh_sach_duong;
            if (window.refreshPaths) window.refreshPaths(window.pathsCache);
        }
        
        if (window.removeMarker) window.removeMarker(currentEditingName);
        delete window.pointsCache[currentEditingName];
        closePointModal();
    }
}

function drawPointOnMap(name, x, y, type, heading) {
    // Hàm này sẽ được gọi để tạo overlay trong OpenSeadragon
    if (window.addMarker) window.addMarker(name, x, y, type, heading);
}

async function saveList(key, inputId, apiUrl) {
    const nameInput = document.getElementById(inputId);
    const name = nameInput.value.trim();
    if(!name) return alert("Vui lòng nhập tên danh sách");

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name })
    });

    if (response.ok) {
        window.location.reload(); // Tải lại để cập nhật combobox và markers
    } else {
        const err = await response.json();
        alert("Lỗi khi lưu: " + err.message);
    }
}

function savePoints() {
    saveList('ten_danh_sach_diem', 'point-list-name', '/api/save_points');
}

function savePaths() {
    saveList('ten_danh_sach_duong', 'path-list-name', '/api/save_paths');
}

/**
 * Cập nhật trạng thái AGV (Pin, v.v.) từ Server mà không refresh trang
 */
let currentRefreshInterval = window.thoiGianCapNhat || 1000;
let statusTimeoutId = null;

async function toggleCharging() {
    const newState = !window.isCharging;
    const response = await postUpdate('sac_pin', newState);
    if (response?.status === 'success') {
        window.isCharging = newState;
        const icon = document.getElementById('charging-icon');
        if (icon) icon.classList.toggle('active', newState);
    }
}

async function shutdownAGV() {
    if (confirm("Bạn có chắc chắn muốn tắt phần mềm AGV không?")) {
        await postUpdate('tat_phan_mem', true);
        alert("Đã gửi lệnh tắt phần mềm.");
    }
}

async function updateStatusUI() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();

        // NEW: Kiểm tra tín hiệu tắt server
        if (data.server_shutdown_imminent) {
            console.log("Server shutdown signal received. Displaying shutdown message.");
            clearTimeout(statusTimeoutId); // Dừng vòng lặp cập nhật trạng thái
            displayShutdownMessage();
            return; // Ngừng xử lý các cập nhật khác
        }

        // Cập nhật giao diện nút Run/Stop từ dữ liệu Server
        if (data.run_state !== undefined) {
            window.currentRunState = data.run_state;
            const runBtn = document.getElementById('btn-run-stop');
            if (runBtn) {
                const isStop = data.run_state === 1;
                runBtn.className = `action-btn ${isStop ? 'btn-stop' : 'btn-run'}`;
                const icon = runBtn.querySelector('i');
                if (icon) icon.className = `fa-solid ${isStop ? 'fa-circle-stop' : 'fa-play'}`;
                const span = runBtn.querySelector('span');
                if (span) span.innerText = isStop ? 'STOP' : 'RUN';
            }
        }

        // Cập nhật giao diện nút Motor từ dữ liệu Server
        if (data.motor_state !== undefined) {
            window.currentMotorState = data.motor_state;
            const motorBtn = document.getElementById('btn-motor');
            if (motorBtn) {
                motorBtn.className = `action-btn ${data.motor_state ? 'btn-motor-on' : 'btn-motor-off'}`;
                const span = motorBtn.querySelector('span');
                if (span) span.innerText = `Motor: ${data.motor_state ? 'ON' : 'OFF'}`;
                const icons = motorBtn.querySelectorAll('i');
                if (icons.length > 1) {
                    icons[1].className = `fa-solid ${data.motor_state ? 'fa-toggle-on' : 'fa-toggle-off'}`;
                }
            }
        }

        // Cập nhật phần trăm pin
        const percentSpan = document.getElementById('battery-percent');
        if (percentSpan) percentSpan.innerText = data.phan_tram_pin + '%';

        // Cập nhật Icon và màu sắc dựa trên mức pin
        const icon = document.getElementById('battery-icon');
        if (icon) {
            const pin = data.phan_tram_pin;
            icon.className = 'fa-solid'; // Reset
            
            if (pin <= 15) {
                icon.classList.add('fa-battery-empty');
                icon.parentElement.style.color = '#e74c3c'; // Đỏ
            } else if (pin <= 30) {
                icon.classList.add('fa-battery-quarter');
                icon.parentElement.style.color = '#f39c12'; // Cam
            } else if (pin <= 60) {
                icon.classList.add('fa-battery-half');
                icon.parentElement.style.color = '#f1c40f'; // Vàng
            } else {
                icon.classList.add('fa-battery-three-quarters');
                icon.parentElement.style.color = '#2ecc71'; // Xanh lá
            }
        }

        // NEW: Kiểm tra và hiển thị overlay đồng bộ hóa
        const syncOverlay = document.getElementById('sync-overlay');
        if (syncOverlay) {
            // Nếu is_syncing là true, hiển thị overlay bằng flex, ngược lại ẩn đi
            syncOverlay.style.display = data.is_syncing ? 'flex' : 'none';
        }

        // Cập nhật trạng thái icon sạc từ server
        if (data.sac_pin !== undefined) {
            window.isCharging = data.sac_pin;
            const charIcon = document.getElementById('charging-icon');
            if (charIcon) charIcon.classList.toggle('active', data.sac_pin);
        }

        // Đồng bộ trạng thái các nút nâng hạ xe từ server
        if (data.dieu_khien_agv) {
            ['nang_xe', 'ha_xe'].forEach(action => {
                const val = data.dieu_khien_agv[action];
                // Cập nhật trạng thái cục bộ để đồng bộ với server
                manualControlState[action] = val;
                // Cập nhật màu sắc nút (class btn-active cho màu cam)
                const btn = document.getElementById(`ctrl-${action}`);
                if (btn) {
                    btn.classList.toggle('btn-active', val === 1);
                }
            });
        }

        // Cập nhật vị trí và lộ trình AGV trên bản đồ
        if (window.updateAGVPosition) {
            window.updateAGVPosition(data.toa_do_agv_pixel[0], data.toa_do_agv_pixel[1], data.huong_agv_do_img, data.kich_thuoc_agv);
        }
        // TỐI ƯU: Kiểm tra nếu đang ở Tab Mapping và đang trong chế độ Tạo mới/Chỉnh sửa
        const isMappingTabActive = document.getElementById('mappingTab').classList.contains('active');
        const isMappingWorkInProgress = data.tao_ban_do_moi || data.chinh_sua_ban_do;

        // Chỉ cập nhật các thành phần nặng của tab Home nếu KHÔNG ở trong trạng thái đang Mapping tập trung
        if (!isMappingTabActive || !isMappingWorkInProgress) {
            if (window.updatePlannedPath) {
                window.updatePlannedPath(data.toa_do_agv_pixel[0], data.toa_do_agv_pixel[1], data.danh_sach_duong_di);
            }
            if (window.updateLidarPoints) {
                window.updateLidarPoints(data.danh_sach_diem_lidar, data.danh_sach_diem_vat_can);
            }
            if (window.refreshLidarExclusionZones) {
                window.refreshLidarExclusionZones(data.vung_loai_bo_pixel, data.hien_thi_chan_xe);
            }
        }
        // Cập nhật các ô input mm nếu đang mở chế độ chỉnh sửa
        if (isLidarEditMode) {
            updateLidarInputs(data.vung_loai_bo_mm);
        }

        // Đồng bộ tốc độ làm mới từ cấu hình trên Server
        if (data.thoi_gian_cap_nhat && data.thoi_gian_cap_nhat !== currentRefreshInterval) {
            currentRefreshInterval = data.thoi_gian_cap_nhat;
        }

        // Cập nhật trạng thái nút Tạm thời xóa vùng
        const btnTempReset = document.getElementById('btn-temp-reset-lidar');
        if (btnTempReset && data.tam_thoi_reset_vung_loai_bo !== undefined) {
            btnTempReset.classList.toggle('btn-active', data.tam_thoi_reset_vung_loai_bo);
        }

        // Đồng bộ chế độ chọn loại mapping
        const btnTaoMoi = document.getElementById('btn-tao-moi');
        const btnChinhSua = document.getElementById('btn-chinh-sua');
        const modeControls = document.getElementById('mapping-mode-controls');

        if (btnTaoMoi && btnChinhSua && modeControls) {
            btnTaoMoi.classList.toggle('btn-active', data.tao_ban_do_moi);
            btnChinhSua.classList.toggle('btn-active', data.chinh_sua_ban_do);
            modeControls.style.display = (data.tao_ban_do_moi || data.chinh_sua_ban_do) ? 'flex' : 'none';
            
            window.isTaoMoi = data.tao_ban_do_moi;
            window.isChinhSua = data.chinh_sua_ban_do;
        }

        // Xử lý nạp toàn bộ bản đồ mapping 1 lần theo yêu cầu từ server (Flag: cap_nhat_ban_do_1_lan_web)
        if (data.cap_nhat_ban_do_1_lan_web === true) {
            console.log("Server requested a full map refresh for mapping layer");
            baseMapLoaded = false; // Tạm dừng cập nhật region cho đến khi ảnh nền mới nạp xong
            const img = new Image();
            img.src = '/api/map_image?source=mapping&v=' + Date.now();
            img.onload = () => {
                if (mappingCtx) {
                    mappingCtx.clearRect(0, 0, mappingCanvas.width, mappingCanvas.height);
                    mappingCtx.drawImage(img, 0, 0);
                }
                baseMapLoaded = true; // Cho phép tiếp tục cập nhật vùng nhỏ xung quanh AGV
                // Sau khi nạp xong thành công, báo lại server để tắt flag, tránh nạp lặp vô hạn
                postUpdate('cap_nhat_ban_do_1_lan_web', false);
            };
        }

        // Đồng bộ chế độ tạo bản đồ và cập nhật UI nút bấm
        if (data.che_do_tao_ban_do !== undefined) {
            // Cập nhật giao diện nút bấm dựa trên trạng thái thực từ server
            isCreateMapMode = data.che_do_tao_ban_do;
            const mappingBtn = document.getElementById('btn-create-map-mode-tab');
            if (mappingBtn) {
                // Nhận diện trạng thái vừa bắt đầu quét để nạp lại toàn bộ ảnh nền mapping
                const mappingStarted = (!isCreateMapMode && data.che_do_tao_ban_do) || window.mappingNeedsFullReload;
                
                isCreateMapMode = data.che_do_tao_ban_do;

                if (mappingStarted && isCreateMapMode) {
                    window.mappingNeedsFullReload = false;
                    baseMapLoaded = false; // Tạm dừng cập nhật vùng nhỏ cho đến khi ảnh nền mới nạp xong
                    console.log("Mapping started: Triggering full map refresh");
                    const img = new Image();
                    img.src = '/api/map_image?source=mapping&v=' + Date.now();
                    img.onload = () => {
                        if (mappingCtx) {
                            mappingCtx.clearRect(0, 0, mappingCanvas.width, mappingCanvas.height);
                            mappingCtx.drawImage(img, 0, 0);
                        }
                        baseMapLoaded = true; // Cho phép tiếp tục cập nhật vùng nhỏ xung quanh AGV
                    };
                }

                mappingBtn.classList.toggle('btn-run', !isCreateMapMode);
                mappingBtn.classList.toggle('btn-stop', isCreateMapMode);
                mappingBtn.querySelector('span').innerText = isCreateMapMode ? 'Dừng quét' : 'Bắt đầu quét';
                const controls = document.getElementById('mapping-active-controls');
                if (controls) {
                    controls.style.display = isCreateMapMode ? 'flex' : 'none';
                }
            }
        }

        // Đồng bộ trạng thái nút cập nhật tất cả điểm
        if (data.update_all_point_in_map !== undefined) {
            const updateBtn = document.getElementById('btn-update-all-points');
            if (updateBtn) {
                updateBtn.classList.toggle('btn-active', data.update_all_point_in_map);
            }
        }

        const isMapping = data.che_do_tao_ban_do;
        const svgLayer = document.getElementById("path-svg-layer");
        if (svgLayer) {
            svgLayer.style.display = isMapping ? "none" : "block";
        }
        const destMarker = document.getElementById("destination-target-marker");
        if (destMarker) {
            destMarker.style.display = isMapping ? "none" : "block";
        }

        // Cập nhật trạng thái thiết bị trong Tab Setting
        ['lidar1', 'lidar2', 'esp32', 'driver_motor', 'pin'].forEach(devKey => {
            const devData = data[devKey];
            const card = document.getElementById(`card-${devKey}`);
            if (card && devData) {
                const dot = card.querySelector('.status-dot');
                const msg = card.querySelector('.status-message');
                
                dot.className = `status-dot ${devData.ket_noi ? 'online' : 'offline'}`;
                msg.innerText = devData.message || 'None';
                msg.style.color = devData.ket_noi ? '#2ecc71' : '#e74c3c';
            }
        });

        // Kiểm tra nếu kích thước bản đồ thay đổi (từ 100 lên 3000 chẳng hạn)
        const mapResized = (data.w_pixel !== currentMapW || data.h_pixel !== currentMapH);
        
        if (mapResized) {
            currentMapW = data.w_pixel;
            currentMapH = data.h_pixel;
            // Cập nhật biến toàn cục để map.js sử dụng
            window.mapWidth = currentMapW;
            window.mapHeight = currentMapH;
            if (window.updateMapSource) {
                window.updateMapSource(currentMapW, currentMapH);
                lastMapRefreshTime = Date.now();
            }
        }

        if (document.getElementById('mappingTab').classList.contains('active')) {
            updateMappingCanvas(data);
        }

    } catch (error) {
        console.error("Không thể lấy trạng thái status:", error);
    } finally {
        // Sử dụng setTimeout thay cho setInterval để có thể điều chỉnh tần suất linh hoạt
        statusTimeoutId = setTimeout(updateStatusUI, currentRefreshInterval);
    }
}

// NEW: Hàm hiển thị thông báo tắt server
function displayShutdownMessage() {
    const body = document.body;
    body.innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            height: 100vh;
            background-color: #2c3e50; /* Màu nền tối */
            color: white;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            font-size: 2rem;
            text-align: center;
            padding: 20px;
        ">
            <i class="fa-solid fa-power-off" style="font-size: 4rem; margin-bottom: 20px; color: #e74c3c;"></i>
            <h1>Hệ thống đang tắt...</h1>
            <p style="font-size: 1.2rem;">Vui lòng đợi trong giây lát hoặc đóng trình duyệt.</p>
        </div>
    `;
    body.style.margin = '0'; // Loại bỏ margin mặc định của body
    body.style.overflow = 'hidden'; // Ngăn cuộn trang
}


// --- Backup Management Functions ---
async function loadBackupList() {
    const container = document.getElementById('backup-list-container');
    container.innerHTML = '<p class="text-muted">Đang tải danh sách sao lưu...</p>';

    try {
        const response = await fetch('/api/list_backups');
        const backups = await response.json();

        if (backups.length === 0) {
            container.innerHTML = '<p class="text-muted">Chưa có bản sao lưu nào.</p>';
            return;
        }

        container.innerHTML = ''; // Xóa thông báo "Đang tải..."
        backups.forEach(backup => {
            const backupItem = document.createElement('div');
            backupItem.className = 'backup-card-item';
            backupItem.innerHTML = `
                <h4><i class="fa-solid fa-box-archive"></i> Bản sao lưu: ${backup.timestamp}</h4>
                <button class="action-btn btn-run" style="padding: 8px 12px; font-size: 0.9rem;" 
                        onclick="showBackupDetails('${backup.timestamp}', ${JSON.stringify(backup.files_backed_up).replace(/"/g, '&quot;')})">
                    <i class="fa-solid fa-eye"></i> Xem chi tiết file
                </button>
            `;
            container.appendChild(backupItem);
        });

    } catch (error) {
        console.error("Lỗi khi tải danh sách sao lưu:", error);
        container.innerHTML = '<p class="text-muted" style="color: red;">Lỗi khi tải danh sách sao lưu.</p>';
    }
}

function showBackupDetails(timestamp, files) {
    const modal = document.getElementById('backup-detail-modal');
    document.getElementById('modal-backup-timestamp').innerText = timestamp;
    const filesContainer = document.getElementById('modal-backup-files');
    filesContainer.innerHTML = '';

    if (files.length === 0) {
        filesContainer.innerHTML = '<p>Không có file nào trong bản sao lưu này.</p>';
    } else {
        files.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = 'backup-file-item';
            fileItem.innerHTML = `
                <span><i class="fa-solid fa-file"></i> ${file.filename}</span>
                <button class="action-btn btn-run" style="padding: 5px 10px; font-size: 0.8rem;" 
                        onclick="restoreFile('${timestamp}', '${file.filename}', '${file.original_target_rel_path}')">
                    <i class="fa-solid fa-rotate-left"></i> Khôi phục
                </button>
            `;
            filesContainer.appendChild(fileItem);
        });
    }
    modal.style.display = 'flex';
}

function closeBackupDetailModal() {
    document.getElementById('backup-detail-modal').style.display = 'none';
}

async function restoreFile(timestamp, filename, original_target_rel_path) {
    if (!confirm(`Bạn có chắc chắn muốn khôi phục file "${filename}" từ bản sao lưu "${timestamp}" không?`)) {
        return;
    }

    try {
        const response = await fetch('/api/restore_backup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timestamp, filename, original_target_rel_path })
        });
        const result = await response.json();
        alert(result.message);
        if (result.status === 'success' && filename === 'log_odds.npy') {
            window.location.reload(); // Tải lại trang để cập nhật bản đồ nếu file bản đồ được khôi phục
        }
    } catch (error) {
        console.error("Lỗi khi khôi phục file:", error);
        alert("Lỗi khi khôi phục file: " + error.message);
    }
}

// Gọi lần đầu ngay khi load script
updateStatusUI();