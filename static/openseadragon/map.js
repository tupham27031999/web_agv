/**
 * Khởi tạo OpenSeadragon để hiển thị bản đồ AGV getTileUrl che_do_tao_ban_do
 */
document.addEventListener("DOMContentLoaded", function() {
    window.tileVersion = 0; // Biến phiên bản để buộc trình duyệt tải lại Tile mới
    const tileSize = 512; // Kích thước mỗi ô bản đồ

    // Tính toán maxLevel dựa trên kích thước bản đồ
    const maxLevel = Math.ceil(Math.log2(Math.max(window.mapWidth || 5000, window.mapHeight || 5000)));

    const viewer = OpenSeadragon({
        id: "osd-viewer",
        prefixUrl: "/static/openseadragon/images/", // Đường dẫn tới các icon của OSD
        tileSources: {
            width: window.mapWidth || 5000,
            height: window.mapHeight || 5000,
            tileSize: tileSize,
            maxLevel: maxLevel,
            getTileUrl: function(level, x, y) {
                return `/api/map_tile/${level}/${x}/${y}/${tileSize}?v=${window.tileVersion}`;
            }
        },
        showNavigationControl: true,
        navigationControlAnchor: OpenSeadragon.ControlAnchor.TOP_LEFT,
        showNavigator: true,
        navigatorPosition: "BOTTOM_LEFT",
        zoomPerScroll: 2,
        animationTime: 0.5,
        blendTime: 0.1,
        constrainDuringPan: true,
        visibilityRatio: 1.0,
        // Cho phép phóng to lên gấp 10 lần độ phân giải thực của ảnh
        maxZoomPixelRatio: 10,
        // Cấu hình các cử chỉ chuột
        gestureSettingsMouse: {
            clickToZoom: false // Tắt tính năng click chuột trái để phóng to
        }
    });

    // Bạn có thể lưu đối tượng viewer vào window để debug hoặc điều khiển từ xa
    window.agvViewer = viewer;

    // Đợi ảnh bản đồ nạp xong mới bắt đầu vẽ các điểm (Tránh lỗi tọa độ 0,0)
    viewer.addHandler('open', function() {
        const imgSize = viewer.world.getItemAt(0).getContentSize();
        
        // Tạo một lớp SVG duy nhất phủ toàn bộ bản đồ
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.id = "path-svg-layer";
        svg.setAttribute("viewBox", `0 0 ${imgSize.x} ${imgSize.y}`);
        svg.style.width = "100%";
        svg.style.height = "100%";
        svg.style.pointerEvents = "none";

        viewer.addOverlay({
            element: svg,
            location: viewer.viewport.imageToViewportCoordinates(new OpenSeadragon.Point(0, 0)),
            width: 1.0,
            placement: OpenSeadragon.Placement.TOP_LEFT
        });

        if (window.pointsCache) {
            window.refreshMarkers(window.pointsCache);
        }
        if (window.pathsCache) {
            window.refreshPaths(window.pathsCache);
        }
        if (window.deleteAreasCache) {
            window.refreshDeleteAreas(window.deleteAreasCache);
        }
    });

    // Xử lý sự kiện click
    viewer.addHandler('canvas-click', function(event) {
        const webPoint = event.position; // Vị trí click trên màn hình (pixels)
        const viewportPoint = viewer.viewport.pointFromPixel(webPoint);
        const imagePoint = viewer.viewport.viewportToImageCoordinates(viewportPoint); // Tọa độ trên ảnh thực tế

        if (typeof isAddPointMode !== 'undefined' && isAddPointMode) {
            event.preventDefaultAction = true; // Ngăn chặn zoom khi đang ở chế độ thêm điểm
            openPointModal(imagePoint.x, imagePoint.y);
        }
        else if (typeof isAddPathMode !== 'undefined' && isAddPathMode) {
            event.preventDefaultAction = true;
            const closest = findClosestPoint(webPoint);
            const clickedName = (closest && closest.dist < 30) ? closest.name : null;
            
            if (window.handlePathCreation) {
                // Truyền tên điểm được click (nếu có) và tọa độ click
                window.handlePathCreation(clickedName, imagePoint);
            }
        }
        else if (typeof isDelPathMode !== 'undefined' && isDelPathMode) {
            event.preventDefaultAction = true;
            const closestPath = findClosestPath(webPoint);
            if (closestPath && closestPath.dist < 20) {
                deletePathFromServer(closestPath.name);
            }
        }
        else if (typeof isEditPointMode !== 'undefined' && isEditPointMode) {
            event.preventDefaultAction = true;

            let closestName = null;
            let minDistance = Infinity;
            const threshold = 30; // Khoảng cách tối đa 30 pixel trên màn hình để nhận diện điểm

            // Duyệt qua danh sách điểm để tìm điểm gần nhất với vị trí click
            for (const name in window.pointsCache) {
                const pt = window.pointsCache[name];
                // Chuyển tọa độ ảnh của điểm thành tọa độ pixel trên màn hình hiện tại
                const imgPt = new OpenSeadragon.Point(pt[0], pt[1]);
                const pixelPt = viewer.viewport.pixelFromPoint(viewer.viewport.imageToViewportCoordinates(imgPt));

                const dx = webPoint.x - pixelPt.x;
                const dy = webPoint.y - pixelPt.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < minDistance) {
                    minDistance = dist;
                    closestName = name;
                }
            }

            if (closestName && minDistance < threshold) {
                const pt = window.pointsCache[closestName];
                openPointModal(pt[0], pt[1], closestName);
            }
        }
        else if (typeof isAdjustPosMode !== 'undefined' && isAdjustPosMode) {
            event.preventDefaultAction = true;
            // Gọi hàm xử lý trong script.js
            if (window.handleMapClickManualPos) window.handleMapClickManualPos(imagePoint.x, imagePoint.y);
        }
        else if (typeof isSelectDeleteAreaMode !== 'undefined' && isSelectDeleteAreaMode) {
            event.preventDefaultAction = true;
            if (!firstCornerForDelete) {
                firstCornerForDelete = imagePoint;
                // Có thể vẽ một điểm tạm thời tại đây nếu muốn
            } else {
                const area = [
                    Math.round(firstCornerForDelete.x),
                    Math.round(firstCornerForDelete.y),
                    Math.round(imagePoint.x),
                    Math.round(imagePoint.y)
                ];
                // Gửi vùng [x1, y1, x2, y2] lên server
                if (window.addDeleteAreaToServer) window.addDeleteAreaToServer(area);
                firstCornerForDelete = null;
            }
        }
    });

    function findClosestPoint(webPoint) {
        let closestName = null;
        let minDistance = Infinity;
        for (const name in window.pointsCache) {
            const pt = window.pointsCache[name];
            const imgPt = new OpenSeadragon.Point(pt[0], pt[1]);
            const pixelPt = viewer.viewport.pixelFromPoint(viewer.viewport.imageToViewportCoordinates(imgPt));
            const dist = Math.sqrt(Math.pow(webPoint.x - pixelPt.x, 2) + Math.pow(webPoint.y - pixelPt.y, 2));
            if (dist < minDistance) {
                minDistance = dist;
                closestName = name;
            }
        }
        return { name: closestName, dist: minDistance };
    }

    function findClosestPath(webPoint) {
        let closestName = null;
        let minDistance = Infinity;
        for (const name in window.pathsCache) {
            const nodes = window.pathsCache[name][0];
            const p1 = window.pointsCache[nodes[0]];
            const p2 = window.pointsCache[nodes[1]];
            if (!p1 || !p2) continue;

            const pix1 = viewer.viewport.pixelFromPoint(viewer.viewport.imageToViewportCoordinates(new OpenSeadragon.Point(p1[0], p1[1])));
            const pix2 = viewer.viewport.pixelFromPoint(viewer.viewport.imageToViewportCoordinates(new OpenSeadragon.Point(p2[0], p2[1])));
            
            const dist = distToSegment(webPoint, pix1, pix2);
            if (dist < minDistance) {
                minDistance = dist;
                closestName = name;
            }
        }
        return { name: closestName, dist: minDistance };
    }

    function distToSegment(p, v, w) {
        const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
        if (l2 === 0) return Math.sqrt(Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2));
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        const proj = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
        return Math.sqrt(Math.pow(p.x - proj.x, 2) + Math.pow(p.y - proj.y, 2));
    }

    async function addPathToServer(name, nodes) {
        const response = await fetch('/api/add_path_temp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, nodes })
        });
        if (response.ok) {
            const result = await response.json();
            window.pathsCache[name] = result.new_path;
            window.addPathLine(name, nodes[0], nodes[1]);
        }
    }

    async function deletePathFromServer(name) {
        const response = await fetch('/api/delete_path_temp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if (response.ok) {
            delete window.pathsCache[name];
            window.removePathLine(name);
        }
    }

    // Hàm vẽ điểm (marker) lên OSD
    window.addMarker = function(name, x, y, type, heading) {
        if (window.isCreateMapMode) return;
        
        const container = document.createElement("div");
        container.id = "marker-" + name;
        container.className = "map-marker-container";

        // Tạo hình tròn trung tâm
        const circle = document.createElement("div");
        circle.className = "marker-circle";
        container.appendChild(circle);

        // Nếu là điểm có hướng, vẽ thêm mũi tên
        if (type === "có hướng") {
            const arrow = document.createElement("div");
            arrow.className = "marker-arrow";
            // CSS rotate quay theo chiều kim đồng hồ, hệ tọa độ Ox thường ngược lại nên dùng dấu trừ
            arrow.style.transform = `rotate(${-heading}deg)`;
            container.appendChild(arrow);
        }

        // Thêm nhãn tên điểm
        const label = document.createElement("span");
        label.className = "marker-label";
        label.innerText = name;
        container.appendChild(label);

        viewer.addOverlay({
            element: container,
            location: viewer.viewport.imageToViewportCoordinates(new OpenSeadragon.Point(x, y)),
            placement: OpenSeadragon.Placement.TOP_LEFT
        });
    };

    window.removeMarker = function(name) {
        viewer.removeOverlay("marker-" + name);
    };

    window.addPathLine = function(name, p1Name, p2Name, type, controlPoint) {
        const p1 = window.pointsCache[p1Name];
        const p2 = window.pointsCache[p2Name];
        const svg = document.getElementById("path-svg-layer");
        if (!p1 || !p2 || !svg) return;

        const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
        pathEl.setAttribute("id", "svg-line-" + name);
        pathEl.setAttribute("class", "path-svg-line");

        if (type === "curve" && controlPoint) {
            let cx, cy;
            // Nếu controlPoint là tên điểm, lấy tọa độ từ cache
            if (typeof controlPoint === 'string' && window.pointsCache[controlPoint]) {
                [cx, cy] = window.pointsCache[controlPoint];
            } else if (Array.isArray(controlPoint)) {
                [cx, cy] = controlPoint;
            }

            if (cx !== undefined && cy !== undefined) {
                pathEl.setAttribute("d", `M ${p1[0]} ${p1[1]} Q ${cx} ${cy} ${p2[0]} ${p2[1]}`);
            } else {
                pathEl.setAttribute("d", `M ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]}`);
            }
        } else {
            // Đường thẳng thông thường
            pathEl.setAttribute("d", `M ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]}`);
        }
        
        svg.appendChild(pathEl);
    };

    window.removePathLine = function(name) {
        const line = document.getElementById("svg-line-" + name);
        if (line) line.remove();
    };

    window.refreshMarkers = function(points) {
        if (window.isCreateMapMode) return;

        // Duyệt qua danh sách overlays chính thức của OSD để xóa các marker cũ
        // Cần tạo một bản sao (slice) để tránh lỗi khi mảng bị thay đổi trong lúc duyệt
        const currentOverlays = viewer.overlays.slice();
        currentOverlays.forEach(ov => {
            if (ov.element && ov.element.id && ov.element.id.startsWith('marker-')) {
                viewer.removeOverlay(ov.element);
            }
        });

        // Vẽ lại danh sách điểm mới từ cache
        Object.keys(points).forEach(name => {
            const d = points[name];
            window.addMarker(name, d[0], d[1], d[2], d[3]);
        });
    };

    window.refreshDeleteAreas = function(areas) {
        // Hàm này để trống để không hiển thị vùng xóa đỏ trên tab Home (OpenSeadragon)
        // Tab Mapping đã tự vẽ vùng xóa trên Canvas riêng.
    };

    window.refreshPaths = function(paths) {
        if (window.isCreateMapMode) return;

        const svg = document.getElementById("path-svg-layer");
        if (!svg) return;
        
        // Xóa sạch các đường cũ trong SVG
        while (svg.firstChild) {
            svg.removeChild(svg.firstChild);
        }

        Object.keys(paths).forEach(name => {
            const nodes = paths[name][0];
            const type = paths[name][1];
            const control = paths[name][2];
            window.addPathLine(name, nodes[0], nodes[1], type, control);
        });
    };

    /**
     * Làm mới ảnh nền bản đồ (Dùng khi đang Mapping)
     * Tải lại toàn bộ ảnh và khôi phục vị trí Zoom/Pan cũ.
     */
    window.refreshMapImage = function() {
        if (!viewer || viewer.world.getItemCount() === 0) return;
        
        // 1. Lưu lại trạng thái Zoom và Tâm hiện tại
        const currentZoom = viewer.viewport.getZoom();
        const currentCenter = viewer.viewport.getCenter();

        // 2. Tải lại nguồn ảnh chính (Dùng timestamp để phá cache trình duyệt)
        // viewer.open sẽ nạp lại toàn bộ, hỗ trợ tốt khi kích thước ảnh thay đổi (100 -> 3000)
        viewer.open({
            type: 'image',
            url: '/api/map_image?v=' + Date.now()
        });

        // 3. Đợi ảnh nạp xong thì khôi phục lại vị trí cũ
        viewer.addOnceHandler('open', function() {
            viewer.viewport.zoomTo(currentZoom, null, true);
            viewer.viewport.panTo(currentCenter, true);
            
            // Cập nhật lại SVG ViewBox theo kích thước ảnh thực tế mới nạp
            const imgSize = viewer.world.getItemAt(0).getContentSize();
            const svg = document.getElementById("path-svg-layer");
            if (svg) {
                svg.setAttribute("viewBox", `0 0 ${imgSize.x} ${imgSize.y}`);
            }
        });
    };

    /**
     * Cập nhật lại toàn bộ nguồn Tile khi kích thước bản đồ thay đổi
     */
    window.updateMapSource = function(newW, newH) {
        window.refreshMapImage();
    };

    /**
     * Cập nhật Marker AGV thời gian thực
     */
    window.updateAGVPosition = function(x, y, heading, size, isGhost = false) {
        const id = isGhost ? "agv-ghost-marker" : "agv-live-marker";
        let container = document.getElementById(id);
        
        const tiledImage = viewer.world.getItemAt(0);
        if (!tiledImage) return;
        const imageSize = tiledImage.getContentSize();
        
        // Tính toán chiều rộng viewport (tỷ lệ so với chiều rộng bản đồ)
        const viewportW = size[0] / imageSize.x;
        const pos = viewer.viewport.imageToViewportCoordinates(new OpenSeadragon.Point(x, y));

        if (!container) {
            container = document.createElement("div");
            container.id = id;
            container.className = "agv-marker-container";

            const rect = document.createElement("div");
            rect.id = id + "-rect";
            rect.className = isGhost ? "agv-rect ghost" : "agv-rect";
            container.appendChild(rect);

            const arrow = document.createElement("div");
            arrow.className = "agv-arrow";
            arrow.id = "agv-live-arrow";
            rect.appendChild(arrow);

            viewer.addOverlay({
                element: container,
                location: pos,
                width: viewportW,
                placement: OpenSeadragon.Placement.CENTER
            });
        }

        // Cập nhật vị trí và tỷ lệ chiều rộng
        viewer.updateOverlay(container, pos, OpenSeadragon.Placement.CENTER);
        const overlay = viewer.getOverlayById(container);
        if (overlay) {
            overlay.width = viewportW;
        }

        // Cập nhật tỷ lệ khung hình (aspect-ratio) và góc xoay
        container.style.aspectRatio = `${size[0]} / ${size[1]}`;
        const rect = document.getElementById(id + "-rect");
        if (rect) {
            rect.style.transform = `rotate(${-heading}deg)`;
        }
    };

    window.removeGhostMarker = function() {
        viewer.removeOverlay("agv-ghost-marker");
    };

    /**
     * Vẽ lộ trình dự kiến từ AGV đến các điểm đích
     */
    window.updatePlannedPath = function(agvX, agvY, pathPoints) {
        if (window.isCreateMapMode) {
            viewer.removeOverlay("destination-target-marker");
            return;
        }

        const svg = document.getElementById("path-svg-layer");
        if (!svg) return;

        // Xóa các đường lộ trình cũ
        const oldLines = svg.querySelectorAll(".planned-path-line");
        oldLines.forEach(line => line.remove());
        viewer.removeOverlay("destination-target-marker");

        if (!pathPoints || pathPoints.length === 0) return;

        // 1. Vẽ đường nối từ AGV đến điểm đầu tiên trong lộ trình (thường là đường thẳng)
        const firstPtName = pathPoints[0];
        const firstPtCoord = window.pointsCache[firstPtName];
        if (firstPtCoord) {
            const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
            pathEl.setAttribute("d", `M ${agvX} ${agvY} L ${firstPtCoord[0]} ${firstPtCoord[1]}`);
            pathEl.setAttribute("class", "planned-path-line");
            svg.appendChild(pathEl);
        }

        // 2. Vẽ các đoạn đường giữa các điểm (Tra cứu xem là thẳng hay cong)
        for (let i = 0; i < pathPoints.length - 1; i++) {
            const p1Name = pathPoints[i];
            const p2Name = pathPoints[i+1];
            const p1 = window.pointsCache[p1Name];
            const p2 = window.pointsCache[p2Name];
            if (!p1 || !p2) continue;

            const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
            pathEl.setAttribute("class", "planned-path-line");

            // Tìm thông tin đường trong cache (thử cả hai chiều P1_P2 hoặc P2_P1)
            const pathInfo = window.pathsCache[`${p1Name}_${p2Name}`] || window.pathsCache[`${p2Name}_${p1Name}`];

            if (pathInfo && pathInfo[1] === "curve" && pathInfo[2]) {
                const controlPoint = pathInfo[2];
                let cx, cy;
                if (typeof controlPoint === 'string' && window.pointsCache[controlPoint]) {
                    [cx, cy] = window.pointsCache[controlPoint];
                } else if (Array.isArray(controlPoint)) {
                    [cx, cy] = controlPoint;
                }

                if (cx !== undefined && cy !== undefined) {
                    pathEl.setAttribute("d", `M ${p1[0]} ${p1[1]} Q ${cx} ${cy} ${p2[0]} ${p2[1]}`);
                } else {
                    pathEl.setAttribute("d", `M ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]}`);
                }
            } else {
                pathEl.setAttribute("d", `M ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]}`);
            }
            svg.appendChild(pathEl);
        }

        // 3. Vẽ icon đích đến cuối cùng (màu đỏ)
        const lastPtName = pathPoints[pathPoints.length - 1];
        const lastPt = window.pointsCache[lastPtName];
        if (lastPt) {
            const destIcon = document.createElement("div");
            destIcon.id = "destination-target-marker";
            destIcon.innerHTML = '<i class="fa-solid fa-location-dot" style="color: #e74c3c; font-size: 30px; filter: drop-shadow(0 0 2px white);"></i>';
            viewer.addOverlay({
                element: destIcon,
                location: viewer.viewport.imageToViewportCoordinates(new OpenSeadragon.Point(lastPt[0], lastPt[1])),
                placement: OpenSeadragon.Placement.BOTTOM
            });
        }
    };

    /**
     * Vẽ các điểm quét Lidar thời gian thực
     */
    window.updateLidarPoints = function(lidarPoints, obstaclePoints) {
        if (window.isCreateMapMode) return;

        const svg = document.getElementById("path-svg-layer");
        if (!svg) return;

        // Xóa các điểm lidar cũ
        const oldLidar = svg.querySelectorAll(".lidar-point");
        oldLidar.forEach(p => p.remove());

        const obstacle = svg.querySelectorAll(".obstacle-point");
        obstacle.forEach(p => p.remove());

        // Vẽ các điểm Lidar ICP (màu vàng)
        if (lidarPoints && lidarPoints.length > 0) {
            const fragment = document.createDocumentFragment();
            lidarPoints.forEach(pt => {
                const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                circle.setAttribute("cx", pt[0]);
                circle.setAttribute("cy", pt[1]);
                circle.setAttribute("r", "3");
                circle.setAttribute("class", "lidar-point");
                fragment.appendChild(circle);
            });
            svg.appendChild(fragment);
        }
        // Vẽ các điểm vật cản (màu đỏ)
        if (obstaclePoints && obstaclePoints.length > 0) {
            const fragment = document.createDocumentFragment();
            obstaclePoints.forEach(pt => {
                const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                circle.setAttribute("cx", pt[0]);
                circle.setAttribute("cy", pt[1]);
                circle.setAttribute("r", "4"); // Hơi lớn hơn để dễ nhìn
                circle.setAttribute("class", "obstacle-point"); // Class mới cho điểm vật cản
                fragment.appendChild(circle);
            });
            svg.appendChild(fragment);
        }
    };

    /**
     * Vẽ các vùng loại bỏ chân xe (Lidar Exclusion Zones)
     */
    window.refreshLidarExclusionZones = function(zones, visible) {
        if (window.isCreateMapMode) return;

        const svg = document.getElementById("path-svg-layer");
        if (!svg) return;

        // Luôn xóa các vùng cũ trước
        const oldZones = svg.querySelectorAll(".lidar-exclusion-rect");
        oldZones.forEach(z => z.remove());

        if (!visible || !zones) return;

        zones.forEach(zone => {
            // zone bây giờ là mảng 4 đỉnh: [[px1,py1], [px2,py2], [px3,py3], [px4,py4]]
            const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            const pointsStr = zone.map(p => p.join(",")).join(" ");
            
            polygon.setAttribute("points", pointsStr);
            polygon.setAttribute("class", "lidar-exclusion-rect");
            svg.appendChild(polygon);
        });
    };
});