import cv2
import os
import numpy as np

def create_apriltag_svg_content(tag_id, tag_img, size_mm):
    """
    Chuyển đổi mảng pixel của AprilTag sang nội dung file SVG (Vector).
    """
    height, width = tag_img.shape
    margin = 1        # Lề trắng (Quiet zone) để camera dễ đọc
    text_space = 2    # Khoảng trống phía dưới để ghi số ID
    
    view_w = width + 2 * margin
    view_h = height + 2 * margin + text_space

    # Khởi tạo chuỗi SVG
    svg = '<?xml version="1.0" standalone="yes"?>\n'
    svg += f'<svg width="{size_mm}" height="{size_mm}" viewBox="0 0 {view_w} {view_h}" xmlns="http://www.w3.org/2000/svg">\n'
    
    # 1. Vẽ nền trắng (đã bao gồm lề và vùng chứa chữ)
    svg += f'  <rect width="{view_w}" height="{view_h}" fill="white"/>\n'
    
    # 2. Duyệt qua mảng pixel và vẽ các ô đen
    for y in range(height):
        for x in range(width):
            # Trong ảnh grayscale của OpenCV: 0 là đen, 255 là trắng
            if tag_img[y, x] < 128:
                svg += f'  <rect width="1" height="1" x="{x + margin}" y="{y + margin}" fill="black"/>\n'
    
    # 3. Thêm chữ ID bên dưới để người dùng dễ phân biệt
    svg += f'  <text x="{view_w/2}" y="{view_h - 0.5}" font-family="Arial" font-size="1.5" font-weight="bold" text-anchor="middle" fill="black">ID: {tag_id}</text>\n'
    svg += '</svg>\n'
    
    return svg

def generate_single_tag(tag_id, output_folder, size_mm="50mm"):
    """
    Hàm tổng hợp: Tạo mã -> Chuyển sang SVG -> Lưu vào folder.
    """
    # 1. Cấu hình loại thẻ 36h11 (Lưới 8x8)
    tag_type = cv2.aruco.DICT_APRILTAG_36h11
    pixel_grid_size = 8 
    dictionary = cv2.aruco.getPredefinedDictionary(tag_type)

    # 2. Tạo mảng pixel của mã (Black & White)
    tag_img = cv2.aruco.generateImageMarker(dictionary, tag_id, pixel_grid_size)

    # 3. Chuyển sang nội dung SVG
    svg_content = create_apriltag_svg_content(tag_id, tag_img, size_mm)

    # 4. Kiểm tra và tạo thư mục nếu chưa có
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)

    # 5. Lưu file
    file_path = os.path.join(output_folder, f"tag_36_11_{tag_id:05d}.svg")
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(svg_content)
    
    return file_path

if __name__ == "__main__":
    # Ví dụ sử dụng hàm để bạn test thử
    # Sau này trên Web bạn chỉ cần gọi hàm generate_single_tag(id, folder)
    ID_CAN_TAO = 5
    THU_MUC = "./data_input_output/danh_sach_ma_AprilTag"
    KICH_THUOC = "30mm"
    
    path = generate_single_tag(ID_CAN_TAO, THU_MUC, KICH_THUOC)
    
    print(f"--------------------------------------------")
    print(f"Đã tạo thành công mã ID {ID_CAN_TAO} tại: {path}")
    print(f"--------------------------------------------")