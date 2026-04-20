# config.py
import os
import json
import numpy as np
import cv2
import math
import socket
from libs_file import remove


def get_occupancy_image(log_odds_map=None):
    log_odds = log_odds_map if log_odds_map is not None else np.zeros((100, 100))  # Default to a blank image if no map is provided
    p = 1.0 / (1.0 + np.exp(-log_odds))
    img = np.full_like(log_odds, 128, dtype=np.uint8)
    img[p < 0.1] = 255    # free -> trắng
    img[p > 0.6] = 0      # tường -> đen
    return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR) # Luôn trả về ảnh 3 kênh  

def get_local_ip():
    """
    Tự động lấy địa chỉ IPv4 của máy tính trong mạng LAN.
    """
    s = None
    try:
        # Tạo một socket để kết nối ra ngoài.
        # Không cần gửi dữ liệu, chỉ cần thực hiện kết nối để hệ điều hành
        # chọn interface mạng phù hợp.
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80)) # 8.8.8.8 là DNS của Google
        ip_address = s.getsockname()[0]
        return ip_address
    except Exception as e:
        print(f"Không thể tự động lấy địa chỉ IP, sử dụng '127.0.0.1'. Lỗi: {e}")
        return "127.0.0.1" # Trả về localhost nếu có lỗi
    finally:
        if s:
            s.close()

print("Địa chỉ IP của máy tính:", get_local_ip())

def read_json_file(file_path):
    """
    Đọc dữ liệu từ một file JSON.

    Args:
        file_path (str): Đường dẫn đến file JSON.

    Returns:
        tuple: (data, message)
            - data (dict | list | None): Dữ liệu đã được đọc từ file JSON,
                                          hoặc None nếu có lỗi.
            - message (str): Thông báo thành công hoặc lỗi.
    """
    if not os.path.exists(file_path):
        return None, f"Lỗi: File không tồn tại tại đường dẫn: {os.path.abspath(file_path)}"

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data, None
    except json.JSONDecodeError as e:
        return None, f"Lỗi giải mã JSON: {e}"
    except Exception as e:
        return None, f"Lỗi không xác định khi đọc file: {e}"
# hàm tìm danh sách cổng COM trên Windows
def find_com_ports():
    if os.name != "nt":
        return []
    import serial.tools.list_ports
    ports = serial.tools.list_ports.comports()
    return [port.device for port in ports]

PATH_PHAN_MEM = (os.path.dirname(os.path.realpath(__file__))).replace("\\", "/")
path_logo = remove.tao_folder(os.path.join(PATH_PHAN_MEM, "static", "logo.png"))
path_map_folder = remove.tao_folder(os.path.join(PATH_PHAN_MEM, "data_input_output", "maps"))
path_folder_danh_sach_diem = remove.tao_folder(os.path.join(PATH_PHAN_MEM, "data_input_output", "point_lists")) # File lưu danh sách điểm
path_folder_danh_sach_duong = remove.tao_folder(os.path.join(PATH_PHAN_MEM, "data_input_output", "path_lists")) # File lưu danh sách đường đi (đơn vị mm)
path_folder_loai_bo_chan_xe = remove.tao_folder(os.path.join(PATH_PHAN_MEM, "data_input_output", "loai_bo_chan_xe"))
path_folder_setting = remove.tao_folder(os.path.join(PATH_PHAN_MEM, "setting"))
path_folder_log_giao_tiep = remove.tao_folder(os.path.join(PATH_PHAN_MEM, "data_input_output", "log_giao_tiep"))
path_folder_upload = remove.tao_folder(os.path.join(PATH_PHAN_MEM, "update_phan_mem", "upload"))
path_folder_dowload = remove.tao_folder(os.path.join(PATH_PHAN_MEM, "update_phan_mem", "download"))
path_folder_scripts = remove.tao_folder(os.path.join(PATH_PHAN_MEM, "data_input_output", "scripts"))
path_download_json = remove.tao_folder(os.path.join(PATH_PHAN_MEM, "update_phan_mem", "download.json"))
path_backup = remove.tao_folder(os.path.join(PATH_PHAN_MEM, "data_backup"))
path_ma_AprilTag = remove.tao_folder(os.path.join(PATH_PHAN_MEM, "data_input_output", "danh_sach_ma_AprilTag"))
# C:\tupn\phan_mem\a_agv\code\cai_tien_web_agv\data_input_output\loai_bo_chan_xe


# paths
if os.name == "nt":
    print("Hệ điều hành là Windows")
    # Đọc file cài đặt cho Windows
    PATH_SETTING = PATH_PHAN_MEM + "/setting/setting_window.json"
elif os.name == "posix":
    print("Hệ điều hành là Ubuntu (Linux)")
    # Đọc file cài đặt cho Ubuntu
    PATH_SETTING = PATH_PHAN_MEM + "/setting/setting_ubuntu.json"

data_setting, error = read_json_file(PATH_SETTING)
# print(data_setting, error)
if error is not None:
    print(f"CẢNH BÁO: Không thể đọc file cấu hình '{os.path.abspath(PATH_SETTING)}'. Lỗi: {error}")
    print("Chương trình có thể không hoạt động đúng hoặc sẽ sử dụng các giá trị mặc định.")


class AGVConfig:
    tat_phan_mem = False
    sac_pin = False
    server_shutdown_imminent = False # Cờ báo hiệu server sắp tắt
    is_syncing = False # NEW: Cờ báo hiệu đang đồng bộ dữ liệu từ Master
    cap_nhat_tu_server = False # khi có tín hiệu cập nhật biến lên True, lúc đó agv sẽ tự dừng lại để đảm bảo an toàn

    VERSION = "1.0.0"
    ten_dieu_de = "AGV " + data_setting.get("name_agv", "X")[-1]
    tab_1 = "Home"
    tab_2 = "Setting"
    tab_3 = "Mapping"
    tab_4 = "Code"
    
    ten_script_dang_chay = "" # Script đang được chọn để thực thi logic
    noi_dung_script_dang_chay = ""
    du_lieu_script_dang_chay = {} # Lưu trữ toàn bộ object JSON của script đang chạy
    stop_code_resume = False # Cờ báo hiệu script đang dừng đợi lệnh gọi API
    id_april_tag_quet_duoc = None # Lưu ID thẻ AprilTag mới nhất quét được, để script có thể truy cập khi cần

    nang_ha_xe_code = None # Lưu trạng thái nâng hạ xe ('nang', 'ha', None)
    music_name_code = None # Lưu tên nhạc đang phát nếu có, để script có thể truy cập khi cần
    dung_trong_giay_code = None # Lưu trữ thời gian tạm dừng còn lại nếu script gọi hàm dung(giay)
    xoay_goc_code = None # Lưu trữ góc xoay hiện tại nếu script gọi hàm xoay_goc(ang)
    xoay_goc_mode_code = 0 # 0: Chỉ cần thân xe hợp với Ox, 1: Đầu xe phải hướng đúng góc
    van_toc_tien_max_code = None
    van_toc_re_max_code = None
    kc_an_toan_truoc_code = None
    kc_an_toan_sau_code = None
    kc_an_toan_ben_canh_code = None
    xac_dinh_vi_tri_xe_vuong_goc_code = None # cho xe vuông góc với xe linh kiện
    xac_dinh_vi_tri_xe_song_song_code = None # cho xe song song với xe linh kiện



    vi_tri_code = None # Tên điểm hiện tại (string)
    dich_den_code = None # Tên điểm đích (string)
    trang_thai_code = None # 'cho_lenh', 'lay_hang', 'tra_hang', 'error'
    april_tag_code = None # ID thẻ quét được (int)
    xy_lanh_code = None # 'nang' hoặc 'ha'
    khoang_cach_den_dich_code = None # mm
    hoan_thanh_vi_tri_vuong_goc_code = None # True/False
    hoan_thanh_vi_tri_song_song_code = None # True/False



    
    # Cấu hình nội dung hướng dẫn trên giao diện Web (Linh hoạt)
    huong_dan_code = {
        "dau_vao": [
            ("vi_tri", "Tên điểm hiện tại (string)"),
            ("dich_den", "Tên điểm đích (string)"),
            ("trang_thai", "'cho_lenh', 'lay_hang', 'tra_hang', 'error'"),
            ("april_tag", "ID thẻ quét được (int)"),
            ("xy_lanh", "'nang' hoặc 'ha'"),
            ("khoang_cach_den_dich", "Khoảng cách đến điểm đích (mm)"),
            ("hoan_thanh_vuong_goc", "Đã định vị vuông góc xong (True/None)"),
            ("hoan_thanh_song_song", "Đã định vị song song xong (True/None)")
        ],
        "dau_ra": [
            ("nang_ha_xe(trang_thai)", "Ra lệnh nâng hạ (trang_thai: 'nang', 'ha', None)"),
            ("bam_coi(name)", "Bật nhạc theo tên (None để tắt)"),
            ("dung(giay)", "Tạm dừng trong x giây"),
            ("print(msg)", "Ghi log ra màn hình console"),
            ("cho_lenh()", "Dừng xe đợi gọi API: /api/code/resume"),
            ("xoay_goc(ang, mode)", "Xoay (mode 0: thân xe, 1: đầu xe) hợp với Ox theo góc ang (độ)"),
            ("set_toc_do_tien(v)", "Cài đặt tốc độ tiến max (để None nếu muốn dùng tốc độ mặc định)"),
            ("set_toc_do_re(v)", "Cài đặt tốc độ rẽ max (để None nếu muốn dùng tốc độ mặc định)"),
            ("set_khoang_cach_an_toan(truoc, sau, canh)", "Cài đặt khoảng cách an toàn (truoc, sau, canh). Để None nếu muốn dùng mặc định"),
            ("set_dinh_vi_xe_linh_kien(mode)", "Định vị xe linh kiện (mode: 'vuong_goc', 'song_song', None)"),
        ],
        "cau_truc": [
            ("if / elif / else", "Cấu trúc điều kiện Python"),
            ("for i in range(x)", "Vòng lặp số lần cố định"),
            ("and / or / not", "Toán tử logic"),
            ("chay_script('tên')", "Chạy script khác đã lưu (tên script phải để trong dấu nháy '')")
        ]
    }

    ID_CAN_TAO = None
    KICH_THUOC = "30mm"

    # Trạng thái điều khiển
    # Nhóm tạo bản đồ mới
    che_do_tao_ban_do = False
    tao_ban_do_moi = False
    cap_nhat_ban_do_1_lan_web = False
    chinh_sua_ban_do = False
    trang_thai_tam_dung_tao_ban_do = True
    ten_ban_do_moi = ""
    lenh_luu_ban_do = 0
    run_state = 0   # 0: Chế độ Run (sẵn sàng), 1: Chế độ Stop (đã nhấn)
    loa_state = 0   # 1 khi nhấn nút loa
    motor_state = False # True: ON, False: OFF
    phan_tram_pin = 80
    loai_lidar = "enthernet" # hoặc "usb"
    name_agv = data_setting["name_agv"]
    ip_agv = data_setting["host"]
    port_agv = data_setting["port"]
    chieu_ngang_xe = data_setting["chieu_ngang_xe"] # đơn vị mm

    

    chieu_doc_xe = data_setting["chieu_doc_xe"] # đơn vị mm
    ty_le_mm_pixel = 20
    thoi_gian_cap_nhat = 500 # ms , cập nhật vị trí, hướng, danh_sach_diem_lidar_icp, danh_sach_duong_di 
    
    lidar_display_skip = 3 # Lấy mỗi điểm thứ N để hiển thị (giảm tải cho Web). 1 là lấy hết, 2 là giảm 1/2, 3 là giảm 1/3...




    # Dữ liệu trạng thái nhận từ các AGV
    # trạng thái agv có thể là:
    # IDLE,       // Nghỉ / Chờ lệnh
    # PICKING,    // Đang lấy hàng
    # DROPPING,   // Đang trả hàng
    # CHARGING,   // Đang sạc
    # BLOCKED,    // Bị vật cản
    # ERROR,      // Lỗi kỹ thuật
    # OFFLINE     // Mất kết nối
    tin_hieu_nhan = {
                    "agv1": {"vi_tri_hien_tai": "", "diem_tiep_theo": "", "dich_den": "", "trang_thai_agv_gui": "", "trang_thai_gui_agv": "", "message": "None", 
                             "danh_sach_duong_di": [], "paths": [], "stop": False, "da_den_dich": 0, "di_chuyen_khong_hang": False},
                    "agv2": {"vi_tri_hien_tai": "", "diem_tiep_theo": "", "dich_den": "", "trang_thai_agv_gui": "", "trang_thai_gui_agv": "", "message": "None", 
                             "danh_sach_duong_di": [], "paths": [], "stop": False, "da_den_dich": 0, "di_chuyen_khong_hang": False},
                    "agv3": {"vi_tri_hien_tai": "", "diem_tiep_theo": "", "dich_den": "", "trang_thai_agv_gui": "", "trang_thai_gui_agv": "", "message": "None", 
                             "danh_sach_duong_di": [], "paths": [], "stop": False, "da_den_dich": 0, "di_chuyen_khong_hang": False},
                    "agv4": {"vi_tri_hien_tai": "", "diem_tiep_theo": "", "dich_den": "", "trang_thai_agv_gui": "", "trang_thai_gui_agv": "", "message": "None", 
                             "danh_sach_duong_di": [], "paths": [], "stop": False, "da_den_dich": 0, "di_chuyen_khong_hang": False},
                    "agv5": {"vi_tri_hien_tai": "", "diem_tiep_theo": "", "dich_den": "", "trang_thai_agv_gui": "", "trang_thai_gui_agv": "", "message": "None", 
                             "danh_sach_duong_di": [], "paths": [], "stop": False, "da_den_dich": 0, "di_chuyen_khong_hang": False},
                    "agv6": {"vi_tri_hien_tai": "", "diem_tiep_theo": "", "dich_den": "", "trang_thai_agv_gui": "", "trang_thai_gui_agv": "", "message": "None", 
                             "danh_sach_duong_di": [], "paths": [], "stop": False, "da_den_dich": 0, "di_chuyen_khong_hang": False},
                    "agv7": {"vi_tri_hien_tai": "", "diem_tiep_theo": "", "dich_den": "", "trang_thai_agv_gui": "", "trang_thai_gui_agv": "", "message": "None", 
                             "danh_sach_duong_di": [], "paths": [], "stop": False, "da_den_dich": 0, "di_chuyen_khong_hang": False}
                }
    # IDLE,       // Nghỉ / Chờ lệnh
    # PICKING,    // Đang lấy hàng
    # DROPPING,   // Đang trả hàng
    # CHARGING,   // Đang sạc
    # BLOCKED,    // Bị vật cản
    # ERROR,      // Lỗi kỹ thuật
    # OFFLINE     // Mất kết nối
    thong_tin_lay_tra_hang = {"vi_tri_1": ["X1", "W1", "G3"],
                            "vi_tri_2": ["X2", "W2", "G28"],
                            "vi_tri_3": ["X3", "W3", "G34"],
                            "vi_tri_4": ["X4", "W4", "W3"],}





    toa_do_agv_pixel = [1700, 2449]
    huong_agv_do_img = 30 # góc hợp với trục Ox
    danh_sach_duong_di = ["C20", "C21"] # danh sách tên các điểm agv sẽ đi qua
    # danh_sach_duong_di mới
    # danh_sach_duong_di = ["C20", "C21"]
    kich_thuoc_agv = [40,20] # pixel, dùng để vẽ hình chữ nhật đại diện cho AGV trên bản đồ
    kich_thuoc_mapping_update = [1000,1000]
    

    toa_do_agv_mm = [3000, 5000]
    huong_agv_do_thuc_rad = np.radians(60)

    danh_sach_tien_max = [10000, 9000, 8500, 8000, 7000, 6500, 6000, 5500, 5000, 4500, 4000, 3500, 3000, 2500, 2000, 1500, 1000, 500]
    danh_sach_re_max = [1000, 900, 800, 700, 600, 500, 400, 300, 250, 200]
    # Quản lý điểm tạm thời
    che_do_them_diem = False
    che_do_sua_diem = False
    che_do_them_duong = False
    che_do_xoa_duong = False
    danh_sach_duong = {} # Format: {"P1_P2": [["P1", "P2"], "curve", "P3"], ...}
    danh_sach_diem = {} # Format: {"P1": [x, y, "loai", huong], ...}
    # Lấy danh sách bản đồ bằng cách liệt kê các thư mục con trong path_map_folder
    danh_sach_ban_do = [d for d in os.listdir(path_map_folder) if os.path.isdir(os.path.join(path_map_folder, d))] if os.path.exists(path_map_folder) else []
    # Đường dẫn file JSON để lưu trạng thái phiên làm việc trước đó
    path_last_config = os.path.join(PATH_PHAN_MEM, "data_input_output", "last_config.json")
    
    # Danh sách các script đã lưu
    danh_sach_scripts = [f.replace('.json', '') for f in os.listdir(path_folder_scripts) if f.endswith('.json')] if os.path.exists(path_folder_scripts) else []

    # Lấy danh sách file điểm và đường từ folder thực tế dùng để tạo thanh combobox trên web
    danh_sach_folder_diem = [f.replace('.json', '') for f in os.listdir(path_folder_danh_sach_diem) if f.endswith('.json')] if os.path.exists(path_folder_danh_sach_diem) else []
    danh_sach_folder_duong = [f.replace('.json', '') for f in os.listdir(path_folder_danh_sach_duong) if f.endswith('.json')] if os.path.exists(path_folder_danh_sach_duong) else []
    danh_sach_vung_loai_bo = [f.replace('.json', '') for f in os.listdir(path_folder_loai_bo_chan_xe) if f.endswith('.json')] if os.path.exists(path_folder_loai_bo_chan_xe) else []
    # Đọc dữ liệu đã lưu từ file JSON
    _saved = {}
    if os.path.exists(path_last_config):
        try:
            with open(path_last_config, 'r') as f:
                _saved = json.load(f)
        except: pass

    ten_ban_do = _saved.get("ten_ban_do", "")
    if ten_ban_do not in danh_sach_ban_do: ten_ban_do = ""

    ten_danh_sach_diem = _saved.get("ten_danh_sach_diem", "")
    if ten_danh_sach_diem not in danh_sach_folder_diem: ten_danh_sach_diem = ""

    ten_danh_sach_duong = _saved.get("ten_danh_sach_duong", "")
    if ten_danh_sach_duong not in danh_sach_folder_duong: ten_danh_sach_duong = ""
    print("ten_danh_sach_duong", ten_danh_sach_duong)

    van_toc_tien_max = _saved.get("van_toc_tien_max", 3000)
    van_toc_re_max = _saved.get("van_toc_re_max", 200)
    
    ten_vung_loai_bo_last = _saved.get("ten_vung_loai_bo", "")
    if ten_vung_loai_bo_last not in danh_sach_vung_loai_bo: ten_vung_loai_bo_last = ""

    thiet_lap_ket_noi = data_setting["thiet_lap_ket_noi"]

    # Khởi tạo thuộc tính img mặc định
    img = np.zeros((8000, 8000, 3), dtype=np.uint8)
    cap_nhat_ban_do_moi = False
    h, w, _ = img.shape
    img_mapping = np.ones((h, w, 3), dtype=np.uint8) * 128
    h_pixel,w_pixel,_ = img.shape



    @classmethod
    def reload_map(cls):
        """Tải lại dữ liệu ảnh bản đồ từ ten_ban_do hiện tại"""
        path_map_file = os.path.join(path_map_folder, cls.ten_ban_do, "log_odds.npy")
        if cls.ten_ban_do and os.path.exists(path_map_file):
            cls.img = get_occupancy_image(log_odds_map=np.load(path_map_file))
            cls.h_pixel, cls.w_pixel, _ = cls.img.shape
            cls.cap_nhat_ban_do_moi = True
        else:
            cls.img = np.zeros((5000, 5000, 3), dtype=np.uint8)
        cls.update_pixel_exclusion_zones()

    @classmethod
    def update_pixel_exclusion_zones(cls):
        """Chuyển đổi vung_loai_bo từ mm sang pixel dựa trên tọa độ AGV hiện tại"""
        agv_x, agv_y = cls.toa_do_agv_pixel
        # Góc xoay theo yêu cầu: (huong - 90). có thể chỉnh sửa khi nhớ lại công thức đúng
        # Dùng dấu âm vì hệ tọa độ màn hình Y hướng xuống và convention xoay của OSD/CSS
        angle_rad = math.radians(-(cls.huong_agv_do_img - 90))
        cos_a = math.cos(angle_rad)
        sin_a = math.sin(angle_rad)
        
        cls.vung_loai_bo_x1y1x2y2_pixel = []
        
        for zone in cls.vung_loai_bo_x1y1x2y2:
            # zone: [x1, y1, x2, y2] đơn vị mm
            x1, y1, x2, y2 = zone
            
            # Xác định 4 đỉnh của hình chữ nhật trong không gian mm (local)
            corners = [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]
            rotated_corners = []
            
            for lx, ly in corners:
                # Áp dụng ma trận xoay 2D
                rx = lx * cos_a - ly * sin_a
                ry = lx * sin_a + ly * cos_a
                
                # Chuyển sang tọa độ pixel trên bản đồ (global)
                px = int(rx / cls.ty_le_mm_pixel + agv_x)
                py = int(ry / cls.ty_le_mm_pixel + agv_y)
                rotated_corners.append([px, py])
            
            cls.vung_loai_bo_x1y1x2y2_pixel.append(rotated_corners)

    @classmethod
    def save_to_file(cls):
        """Ghi các lựa chọn hiện tại vào file JSON để ghi nhớ"""
        data = {
            "ten_ban_do": cls.ten_ban_do,
            "ten_danh_sach_diem": cls.ten_danh_sach_diem,
            "ten_danh_sach_duong": cls.ten_danh_sach_duong,
            "van_toc_tien_max": cls.van_toc_tien_max,
            "van_toc_re_max": cls.van_toc_re_max,
            "ten_vung_loai_bo": cls.loai_bo_coc_xe["ten_vung_loai_bo"]
        }
        os.makedirs(os.path.dirname(cls.path_last_config), exist_ok=True)
        with open(cls.path_last_config, 'w') as f:
            json.dump(data, f)

    

    @classmethod
    def update_danh_sach_diem(cls):
        """Quét thư mục để cập nhật danh sách các file điểm json"""
        if os.path.exists(path_folder_danh_sach_diem):
            cls.danh_sach_folder_diem = [f.replace('.json', '') for f in os.listdir(path_folder_danh_sach_diem) if f.endswith('.json')]
        else:
            cls.danh_sach_folder_diem = []

    @classmethod
    def load_points(cls, name):
        """Tải danh sách điểm từ file json vào danh_sach_diem"""
        if not name:
            # Chỉ reset nếu chưa có dữ liệu trong bộ nhớ để tránh ghi đè khi reload server
            if not cls.danh_sach_diem:
                cls.danh_sach_diem = {}
            return

        path = os.path.join(path_folder_danh_sach_diem, f"{name}.json")
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    cls.danh_sach_diem = json.load(f)
            except:
                cls.danh_sach_diem = {}
        else:
            cls.danh_sach_diem = {}
        

    @classmethod
    def save_points_to_file(cls, name):
        """Lưu danh sách điểm hiện tại thành file json và cập nhật cấu hình"""
        os.makedirs(path_folder_danh_sach_diem, exist_ok=True)
        path = os.path.join(path_folder_danh_sach_diem, f"{name}.json")
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(cls.danh_sach_diem, f, indent=4)
        cls.update_danh_sach_diem()
        cls.ten_danh_sach_diem = name
        cls.save_to_file()

    @classmethod
    def update_danh_sach_vung_loai_bo(cls):
        """Cập nhật danh sách file vùng loại bỏ từ thư mục"""
        if os.path.exists(path_folder_loai_bo_chan_xe):
            cls.danh_sach_vung_loai_bo = [f.replace('.json', '') for f in os.listdir(path_folder_loai_bo_chan_xe) if f.endswith('.json')]

    @classmethod
    def load_loai_bo(cls, name):
        """Tải vùng loại bỏ từ file JSON vào vung_loai_bo_x1x2y1y2"""
        if not name: return
        path = os.path.join(path_folder_loai_bo_chan_xe, f"{name}.json")
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    # Giả sử file JSON lưu dạng list các vùng [[x1,y1,x2,y2], ...]
                    cls.vung_loai_bo_x1y1x2y2 = data
                    cls.loai_bo_coc_xe["ten_vung_loai_bo"] = name
                    cls.update_pixel_exclusion_zones()
            except Exception as e:
                print(f"Error loading lidar zone: {e}")

    @classmethod
    def save_loai_bo_to_file(cls, name):
        """Lưu vung_loai_bo hiện tại (từ lidar sampling) thành file JSON"""
        os.makedirs(path_folder_loai_bo_chan_xe, exist_ok=True)
        path = os.path.join(path_folder_loai_bo_chan_xe, f"{name}.json")
        try:
            with open(path, 'w', encoding='utf-8') as f:
                # Lưu dữ liệu từ biến vung_loai_bo_x1y1x2y2 theo yêu cầu mới
                json.dump(cls.vung_loai_bo_x1y1x2y2, f, indent=4)
            cls.update_danh_sach_vung_loai_bo()
            cls.loai_bo_coc_xe["ten_vung_loai_bo"] = name
            cls.update_pixel_exclusion_zones()
            cls.save_to_file()
        except Exception as e:
            print(f"Error saving lidar zone: {e}")

    @classmethod
    def update_danh_sach_duong(cls):
        """Quét thư mục để cập nhật danh sách các file đường json"""
        if os.path.exists(path_folder_danh_sach_duong):
            cls.danh_sach_folder_duong = [f.replace('.json', '') for f in os.listdir(path_folder_danh_sach_duong) if f.endswith('.json')]
        else:
            cls.danh_sach_folder_duong = []

    @classmethod
    def load_paths(cls, name):
        """Tải danh sách đường từ file json vào danh_sach_duong"""
        if not name:
            if not cls.danh_sach_duong:
                cls.danh_sach_duong = {}
            return

        path = os.path.join(path_folder_danh_sach_duong, f"{name}.json")
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    cls.danh_sach_duong = json.load(f)
            except:
                cls.danh_sach_duong = {}
        else:
            cls.danh_sach_duong = {}

    @classmethod
    def save_paths_to_file(cls, name):
        """Lưu danh sách đường hiện tại thành file json"""
        os.makedirs(path_folder_danh_sach_duong, exist_ok=True)
        path = os.path.join(path_folder_danh_sach_duong, f"{name}.json")
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(cls.danh_sach_duong, f, indent=4)
        cls.update_danh_sach_duong()
        cls.ten_danh_sach_duong = name
        cls.save_to_file()




    
    # chức năng cập nhật vị trí agv thủ công
    cap_nhat_vi_tri_agv = {"toa_do": [0, 0], "huong": 0, "update_tam_thoi": False, "update": False}
    # các điểm mà agv đang quét sau khi đã qua icp, dạng array [[x, y, 1], ...]
    danh_sach_diem_lidar_icp = np.array([
        [1700, 2530, 1], 
        [2500, 2500, 1], 
        [2600, 2700, 1], 
        [2700, 2900, 1], 
        [2350, 2450, 1], 
        [2550, 2650, 1], 
        [2650, 2850, 1], 
        [2750, 2050, 1]
    ]).astype(np.int32)

    danh_sach_diem_vat_can = [[1600, 2530]]

    an_hien_diem_lidar_icp = False # dùng để bật tắt hiển thị điểm lidar sau khi qua icp, vì có thể sẽ có nhiều
    

    # 1 số tính năng thêm vào
    xoa_vung_ban_do = {"vung_xoa": [], "update": 0} # dùng để xóa bót 1 số vùng bản đồ đã quét rồi muốn quét lại
    kiem_tra_vi_tri_xe = False # dùng để kiểm tra vị trí xe khi nâng hạ on/off

    
    # loại bỏ 1 số vật cản cố định ở trong vùng an toàn đi khỏi vùng quét của lidar
    loai_bo_coc_xe = {"che_do_lay_mau": 0,"ten_vung_loai_bo": ten_vung_loai_bo_last, "luu_vung_loai_bo": False, "update": 0}
    # giả sử giá trị quét lưu vào biến sau, đơn vị mm và tọa độ là gốc O ở 0,0, là giá trị của loai_bo_coc_xe["vung_loai_bo"]
    vung_loai_bo_x1y1x2y2 =[[-330,740,-180,1020],[170,770, 375,980],[190,-955,335,-760],[-325,-915,-170,-765]]
    vung_loai_bo_x1y1x2y2_pixel = []
    tam_thoi_reset_vung_loai_bo = False # nếu bằng True thì tạm thời vung_loai_bo_x1y1x2y2 = [] và vung_loai_bo_x1y1x2y2_pixel = [], khi về False thì sẽ load lại
    # hiển thị vùng chân xe
    hien_thi_chan_xe = True


    # hiển thị kết nối lidar, esp32, driver motor, cột tên lỗi nếu có
    lidar1 = {"ket_noi": False, "message": "Disconnect", "ip": data_setting["host_lidar_1"], "port": data_setting["port_lidar_1"]}
    lidar2 = {"ket_noi": False, "message": "Disconnect", "ip": data_setting["host_lidar_2"], "port": data_setting["port_lidar_2"]}
    esp32 = {"ket_noi": False, "message": "Disconnect", "COM": data_setting["cong_esp32"][0], "baudrate": data_setting["cong_esp32"][1]}
    driver_motor = {"ket_noi": False, "message": "Disconnect", "COM": data_setting["cong_driver"][0], "baudrate": data_setting["cong_driver"][1]}
    pin = {"ket_noi": False, "message": "Disconnect", "COM": data_setting["com_pin"][0], "baudrate": data_setting["com_pin"][1]} # ket noi qua r485 nên dùng COM


    dieu_khien_agv = {"dieu_khien_thu_cong": False, "tien": 0, "lui": 0, "trai": 0, "phai": 0, "ha_xe": 0, "nang_xe": 0}
    last_manual_command_time = 0

    update_all_point_in_map = False # dùng để cập nhật tất cả các điểm mà lidar quét vào bản đồ gốc

    
# Gọi nạp bản đồ ngay khi module được load lần đầu
AGVConfig.reload_map()
# Nạp danh sách điểm hiện tại dựa trên cấu hình đã lưu
AGVConfig.load_points(AGVConfig.ten_danh_sach_diem)
# Nạp danh sách đường hiện tại
AGVConfig.load_paths(AGVConfig.ten_danh_sach_duong)
# Nạp vùng chân xe hiện tại
AGVConfig.load_loai_bo(AGVConfig.loai_bo_coc_xe["ten_vung_loai_bo"])




   