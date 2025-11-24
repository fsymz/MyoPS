// multiplanar-visualization.js - 完整修复版本
class MultiPlanarVisualization {
    constructor() {
        this.canvases = {
            axial: document.getElementById('axialCanvas'),
            coronal: document.getElementById('coronalCanvas'),
            sagittal: document.getElementById('sagittalCanvas'),
            threeD: document.getElementById('threeDCanvas')
        };
        
        this.contexts = {};
        Object.keys(this.canvases).forEach(plane => {
            if (this.canvases[plane]) {
                this.contexts[plane] = this.canvases[plane].getContext('2d');
            }
        });
        
        this.imageData = null;
        this.segmentationData = null;
        this.segmentationOpacity = 0.7;
        this.currentSlices = { axial: 0, coronal: 0, sagittal: 0 };
        
        // 颜色映射
        this.colors = {
            0: [0, 0, 0, 0],        // 背景
            1: [255, 0, 0, 255],    // LV 血池
            2: [0, 255, 0, 255],    // RV 血池  
            3: [0, 0, 255, 255],    // LV 正常心肌
            4: [255, 255, 0, 255],  // LV 心肌水肿
            5: [255, 0, 255, 255]   // LV 心肌瘢痕
        };
        
        // 放大相关属性
        this.zoomLevels = {
            axial: 1,
            coronal: 1,
            sagittal: 1,
            threeD: 1
        };
        this.zoomCenters = {
            axial: { x: 0.5, y: 0.5 },
            coronal: { x: 0.5, y: 0.5 },
            sagittal: { x: 0.5, y: 0.5 }
        };
        this.zoomSliders = {};
        this.zoomDisplays = {};
        this.isZoomMode = false;
        this.activeZoomView = null;
        
        // 十字准星相关属性
        this.crosshairPosition = {
            x: 0.5,  // 归一化坐标 [0,1]
            y: 0.5,
            z: 0.5
        };
        this.isCrosshairActive = true;
        
        this.initialize();
    }

    initialize() {
        this.resizeCanvases();
        window.addEventListener('resize', () => this.resizeCanvases());
        this.bindControls();
        this.setupZoomControls();
        this.setupCrosshairControls();
        this.createZoomSliders();
    }

    resizeCanvases() {
        ['axial', 'coronal', 'sagittal'].forEach(plane => {
            const canvas = this.canvases[plane];
            if (!canvas) return;
            
            const container = canvas.parentElement;
            const rect = container.getBoundingClientRect();
            
            // 设置画布尺寸为容器尺寸
            canvas.width = rect.width;
            canvas.height = rect.height;
        });
    }

    // 创建放大滑块
    createZoomSliders() {
        ['axial', 'coronal', 'sagittal'].forEach(plane => {
            const container = this.canvases[plane].parentElement;
            
            // 创建滑块容器
            const sliderContainer = document.createElement('div');
            sliderContainer.className = 'zoom-slider-container';
            sliderContainer.style.cssText = `
                position: absolute;
                bottom: 10px;
                right: 10px;
                background: rgba(0, 0, 0, 0.7);
                padding: 8px;
                border-radius: 5px;
                display: none;
                z-index: 10;
            `;
            
            // 创建滑块
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = '1';
            slider.max = '5';
            slider.step = '0.1';
            slider.value = '1';
            slider.style.cssText = `
                width: 100px;
                margin: 0 5px;
            `;
            
            // 创建显示标签
            const display = document.createElement('span');
            display.style.cssText = `
                color: white;
                font-size: 12px;
                min-width: 40px;
                display: inline-block;
            `;
            display.textContent = '1.0x';
            
            sliderContainer.appendChild(slider);
            sliderContainer.appendChild(display);
            container.appendChild(sliderContainer);
            
            this.zoomSliders[plane] = slider;
            this.zoomDisplays[plane] = display;
            
            // 绑定滑块事件
            slider.addEventListener('input', (e) => {
                this.zoomLevels[plane] = parseFloat(e.target.value);
                display.textContent = `${this.zoomLevels[plane].toFixed(1)}x`;
                this.renderPlane(plane);
            });
        });
    }

    setImageData(imageData) {
        this.imageData = imageData;
        this.currentSlices = {
            axial: Math.floor(imageData.dimensions[2] / 2),
            coronal: Math.floor(imageData.dimensions[1] / 2),
            sagittal: Math.floor(imageData.dimensions[0] / 2)
        };
        // 初始化十字准星位置为图像中心
        this.crosshairPosition = { x: 0.5, y: 0.5, z: 0.5 };
        this.renderAll();
        this.updateSliceIndicators();
    }

    setSegmentationData(segmentationData) {
        this.segmentationData = segmentationData;
        this.renderAll();
    }

    setSegmentationOpacity(opacity) {
        this.segmentationOpacity = opacity;
        if (this.segmentationData) {
            this.renderAll();
        }
    }

    navigateSlice(plane, delta) {
        if (!this.imageData) return;
        
        const dims = this.imageData.dimensions;
        const maxSlice = plane === 'axial' ? dims[2] - 1 : 
                        plane === 'coronal' ? dims[1] - 1 : 
                        dims[0] - 1;
        
        const newSlice = Math.max(0, Math.min(this.currentSlices[plane] + delta, maxSlice));
        
        // 只有当切片真正改变时才更新
        if (newSlice !== this.currentSlices[plane]) {
            this.currentSlices[plane] = newSlice;
            
            // 更新十字准星的z坐标
            this.crosshairPosition.z = this.currentSlices.axial / (dims[2] - 1);
            
            this.renderPlane(plane);
            this.updateSliceIndicator(plane);
            
            console.log(`🔄 ${plane} 切片更新: ${this.currentSlices[plane] + 1}/${maxSlice + 1}`);
        }
    }

    renderAll() {
        ['axial', 'coronal', 'sagittal'].forEach(plane => this.renderPlane(plane));
    }

    renderPlane(plane) {
        if (!this.imageData) return;
        
        const ctx = this.contexts[plane];
        const canvas = this.canvases[plane];
        const sliceIdx = this.currentSlices[plane];
        
        if (!ctx || !canvas) return;
        
        // 清除画布
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 计算各向异性缩放参数
        let aspectRatio = null;
        if (this.imageData.voxelSize) {
            const [pixelSizeX, pixelSizeY, pixelSizeZ] = this.imageData.voxelSize;
            
            switch (plane) {
                case 'axial':
                    aspectRatio = [pixelSizeX, pixelSizeY];
                    break;
                case 'coronal':
                    aspectRatio = [pixelSizeX, pixelSizeZ];
                    break;
                case 'sagittal':
                    aspectRatio = [pixelSizeY, pixelSizeZ];
                    break;
            }
        }
        
        // 渲染基础图像
        const baseImage = this.renderBaseImage(plane, sliceIdx);
        if (baseImage) {
            if (this.isZoomMode && this.activeZoomView === plane && this.zoomLevels[plane] > 1) {
                this.drawZoomedImage(ctx, canvas, baseImage, aspectRatio, plane);
            } else {
                this.drawImageToCanvas(ctx, canvas, baseImage, aspectRatio);
            }
        }
        
        // 渲染分割叠加层
        if (this.segmentationData) {
            const overlayImage = this.renderSegmentationOverlay(plane, sliceIdx);
            if (overlayImage) {
                ctx.save();
                ctx.globalAlpha = this.segmentationOpacity;
                if (this.isZoomMode && this.activeZoomView === plane && this.zoomLevels[plane] > 1) {
                    this.drawZoomedImage(ctx, canvas, overlayImage, aspectRatio, plane);
                } else {
                    this.drawImageToCanvas(ctx, canvas, overlayImage, aspectRatio);
                }
                ctx.restore();
            }
        }
        
        // 绘制十字准星（如果不在放大模式下）
        if (!this.isZoomMode && this.isCrosshairActive) {
            this.drawCrosshairs(ctx, canvas, plane);
        }
        
        // 绘制放大模式的十字准星
        if (this.isZoomMode && this.activeZoomView === plane) {
            this.drawZoomCrosshairs(ctx, canvas, plane);
        }
    }

    drawImageToCanvas(ctx, canvas, image, aspectRatio = null) {
        // 禁用图像平滑，使用最近邻插值
        ctx.imageSmoothingEnabled = false;
        ctx.mozImageSmoothingEnabled = false;
        ctx.webkitImageSmoothingEnabled = false;
        ctx.msImageSmoothingEnabled = false;
        
        let scaleX, scaleY, x, y, drawWidth, drawHeight;
        
        if (aspectRatio) {
            // 各向异性缩放 - 考虑像素宽高比
            scaleX = canvas.width / (image.width * aspectRatio[0]);
            scaleY = canvas.height / (image.height * aspectRatio[1]);
            
            // 保持比例但考虑各向异性
            const scale = Math.min(scaleX, scaleY);
            
            drawWidth = image.width * aspectRatio[0] * scale;
            drawHeight = image.height * aspectRatio[1] * scale;
            x = (canvas.width - drawWidth) / 2;
            y = (canvas.height - drawHeight) / 2;
        } else {
            // 等向性缩放
            scaleX = canvas.width / image.width;
            scaleY = canvas.height / image.height;
            const scale = Math.min(scaleX, scaleY);
            
            drawWidth = image.width * scale;
            drawHeight = image.height * scale;
            x = (canvas.width - drawWidth) / 2;
            y = (canvas.height - drawHeight) / 2;
        }
        
        // 确保尺寸为整数像素，避免模糊
        x = Math.round(x);
        y = Math.round(y);
        drawWidth = Math.round(drawWidth);
        drawHeight = Math.round(drawHeight);
        
        ctx.drawImage(
            image, 
            0, 0, image.width, image.height, 
            x, y, drawWidth, drawHeight
        );
    }

    // 绘制放大图像
    drawZoomedImage(ctx, canvas, image, aspectRatio, plane) {
        const zoomLevel = this.zoomLevels[plane];
        const center = this.zoomCenters[plane];
        
        // 计算基本缩放
        let baseScaleX, baseScaleY;
        if (aspectRatio) {
            baseScaleX = canvas.width / (image.width * aspectRatio[0]);
            baseScaleY = canvas.height / (image.height * aspectRatio[1]);
        } else {
            baseScaleX = canvas.width / image.width;
            baseScaleY = canvas.height / image.height;
        }
        const baseScale = Math.min(baseScaleX, baseScaleY);
        
        // 应用放大
        const scale = baseScale * zoomLevel;
        
        // 计算显示区域
        const displayWidth = canvas.width / scale;
        const displayHeight = canvas.height / scale;
        
        const srcX = Math.max(0, center.x * image.width - displayWidth / 2);
        const srcY = Math.max(0, center.y * image.height - displayHeight / 2);
        const srcWidth = Math.min(displayWidth, image.width - srcX);
        const srcHeight = Math.min(displayHeight, image.height - srcY);
        
        // 绘制放大后的图像
        ctx.drawImage(
            image,
            srcX, srcY, srcWidth, srcHeight,
            0, 0, canvas.width, canvas.height
        );
    }

    renderBaseImage(plane, sliceIdx) {
        const { data, dimensions } = this.imageData;
        const slice = this.extractSlice(data, dimensions, plane, sliceIdx);
        
        const canvas = document.createElement('canvas');
        canvas.width = slice.width;
        canvas.height = slice.height;
        const ctx = canvas.getContext('2d');
        
        const imageData = ctx.createImageData(slice.width, slice.height);
        for (let i = 0; i < slice.data.length; i++) {
            const val = slice.data[i];
            const idx = i * 4;
            imageData.data[idx] = val;        // R
            imageData.data[idx + 1] = val;    // G
            imageData.data[idx + 2] = val;    // B
            imageData.data[idx + 3] = 255;    // A
        }
        
        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    renderSegmentationOverlay(plane, sliceIdx) {
        const { data, dimensions } = this.segmentationData;
        const slice = this.extractSlice(data, dimensions, plane, sliceIdx);
        
        const canvas = document.createElement('canvas');
        canvas.width = slice.width;
        canvas.height = slice.height;
        const ctx = canvas.getContext('2d');
        
        const imageData = ctx.createImageData(slice.width, slice.height);
        for (let i = 0; i < slice.data.length; i++) {
            const classId = slice.data[i];
            const color = this.colors[classId] || [0, 0, 0, 0];
            const idx = i * 4;
            
            imageData.data[idx] = color[0];        // R
            imageData.data[idx + 1] = color[1];    // G
            imageData.data[idx + 2] = color[2];    // B
            imageData.data[idx + 3] = Math.floor(color[3] * this.segmentationOpacity); // A
        }
        
        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    extractSlice(data, dimensions, plane, sliceIdx) {
        const [width, height, depth] = dimensions;
        
        switch (plane) {
            case 'axial':
                // 轴向切片：Z轴固定 - 直接提取，不进行插值
                const axialSlice = new Uint8Array(width * height);
                const startIdx = sliceIdx * width * height;
                
                for (let i = 0; i < width * height; i++) {
                    if (startIdx + i < data.length) {
                        axialSlice[i] = data[startIdx + i];
                    }
                }
                
                return {
                    data: axialSlice,
                    width: width,
                    height: height
                };
                
            case 'coronal':
                // 冠状切片：Y轴固定 - 直接提取，不进行插值
                const coronalData = new Uint8Array(width * depth);
                for (let z = 0; z < depth; z++) {
                    for (let x = 0; x < width; x++) {
                        const srcIndex = (z * height + sliceIdx) * width + x;
                        if (srcIndex < data.length) {
                            coronalData[z * width + x] = data[srcIndex];
                        }
                    }
                }
                return { 
                    data: coronalData, 
                    width: width, 
                    height: depth 
                };
                
            case 'sagittal':
                // 矢状切片：X轴固定 - 直接提取，不进行插值
                const sagittalData = new Uint8Array(height * depth);
                for (let z = 0; z < depth; z++) {
                    for (let y = 0; y < height; y++) {
                        const srcIndex = (z * height + y) * width + sliceIdx;
                        if (srcIndex < data.length) {
                            sagittalData[z * height + y] = data[srcIndex];
                        }
                    }
                }
                return { 
                    data: sagittalData, 
                    width: height, 
                    height: depth 
                };
        }
    }

    bindControls() {
        // 键盘控制
        document.addEventListener('keydown', (e) => {
            if (!this.imageData) return;
            
            switch(e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    this.navigateSlice('axial', 1);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.navigateSlice('axial', -1);
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.navigateSlice('sagittal', -1);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.navigateSlice('sagittal', 1);
                    break;
            }
        });

        // 鼠标滚轮控制
        ['axial', 'coronal', 'sagittal'].forEach(plane => {
            const canvas = this.canvases[plane];
            if (!canvas) return;
            
            canvas.addEventListener('wheel', (e) => {
                e.preventDefault();
                if (!this.imageData) return;
                
                const delta = Math.sign(e.deltaY); // 标准化滚轮方向
                this.navigateSlice(plane, -delta); // 反转方向（更符合直觉）
            });
            
            // 添加悬停提示
            canvas.title = `使用鼠标滚轮切换${this.getPlaneName(plane)}切片`;
            canvas.style.cursor = 'ns-resize';
        });
    }

    // 设置放大控制
    setupZoomControls() {
        // 为每个视图添加双击放大功能
        ['axial', 'coronal', 'sagittal'].forEach(plane => {
            const canvas = this.canvases[plane];
            if (!canvas) return;
            
            canvas.addEventListener('dblclick', (e) => {
                this.toggleZoom(plane, e);
            });
        });

        // 添加键盘控制退出放大
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.resetZoom();
            }
        });
    }

    // 设置十字准星控制
    setupCrosshairControls() {
        ['axial', 'coronal', 'sagittal'].forEach(plane => {
            const canvas = this.canvases[plane];
            if (!canvas) return;
            
            // 只在点击时更新十字准星位置
            canvas.addEventListener('click', (e) => {
                if (!this.isZoomMode) {
                    this.updateCrosshairPosition(plane, e);
                }
            });
        });
    }

    // 切换放大模式
    toggleZoom(plane, event) {
        if (this.isZoomMode && this.activeZoomView === plane) {
            // 如果已经是放大模式且点击的是当前活动视图，则重置
            this.resetZoom();
        } else {
            // 进入放大模式
            this.isZoomMode = true;
            this.activeZoomView = plane;
            
            // 计算点击位置作为放大中心
            if (event) {
                this.updateZoomCenter(plane, event);
            }
            
            // 显示对应视图的滑块
            this.showZoomSlider(plane);
            
            // 更新UI显示
            this.updateZoomIndicator();
            this.renderAll();
            
            console.log(`🔍 放大模式: ${plane} 视图`);
        }
    }

    // 显示放大滑块
    showZoomSlider(plane) {
        // 隐藏所有滑块
        Object.keys(this.zoomSliders).forEach(p => {
            const slider = this.zoomSliders[p];
            if (slider && slider.parentElement) {
                slider.parentElement.style.display = 'none';
            }
        });
        
        // 显示当前视图的滑块
        if (this.zoomSliders[plane] && this.zoomSliders[plane].parentElement) {
            this.zoomSliders[plane].parentElement.style.display = 'block';
        }
    }

    // 更新放大中心
    updateZoomCenter(plane, event) {
        const canvas = this.canvases[plane];
        const rect = canvas.getBoundingClientRect();
        
        const x = (event.clientX - rect.left) / canvas.width;
        const y = (event.clientY - rect.top) / canvas.height;
        
        this.zoomCenters[plane] = { x, y };
        this.renderPlane(plane);
    }

    // 重置放大
    resetZoom() {
        this.isZoomMode = false;
        this.activeZoomView = null;
        
        // 重置所有视图的放大级别
        Object.keys(this.zoomLevels).forEach(plane => {
            this.zoomLevels[plane] = 1;
            this.zoomCenters[plane] = { x: 0.5, y: 0.5 };
            
            // 重置滑块
            if (this.zoomSliders[plane]) {
                this.zoomSliders[plane].value = '1';
                this.zoomSliders[plane].parentElement.style.display = 'none';
            }
            if (this.zoomDisplays[plane]) {
                this.zoomDisplays[plane].textContent = '1.0x';
            }
        });
        
        this.updateZoomIndicator();
        this.renderAll();
        
        console.log('🔍 退出放大模式');
    }

    // 更新放大指示器
    updateZoomIndicator() {
        // 更新UI显示当前放大状态
        const views = ['axial', 'coronal', 'sagittal'];
        views.forEach(plane => {
            const label = document.querySelector(`#${plane}Canvas`).parentElement.parentElement.querySelector('.view-label');
            if (label) {
                if (this.isZoomMode && this.activeZoomView === plane) {
                    label.innerHTML = `${this.getPlaneName(plane)}视图 (放大 ${this.zoomLevels[plane].toFixed(1)}x) <span style="color:#3498db;font-size:0.8em">[ESC退出]</span>`;
                } else {
                    label.textContent = `${this.getPlaneName(plane)}视图`;
                }
            }
        });
    }

    // 更新十字准星位置
    updateCrosshairPosition(plane, event) {
        if (!this.imageData) return;
        
        const canvas = this.canvases[plane];
        const rect = canvas.getBoundingClientRect();
        const dims = this.imageData.dimensions;
        
        // 获取鼠标在canvas上的位置
        const x = (event.clientX - rect.left) / canvas.width;
        const y = (event.clientY - rect.top) / canvas.height;
        
        // 根据当前视图类型更新对应的坐标
        switch (plane) {
            case 'axial':
                // 轴向视图：x,y 控制十字准星的 x,y 坐标
                this.crosshairPosition.x = x;
                this.crosshairPosition.y = y;
                // z 坐标由当前切片决定
                this.crosshairPosition.z = this.currentSlices.axial / (dims[2] - 1);
                break;
                
            case 'coronal':
                // 冠状视图：x 控制 x 坐标，y 控制 z 坐标
                this.crosshairPosition.x = x;
                this.crosshairPosition.z = y;
                // y 坐标由当前切片决定
                this.crosshairPosition.y = this.currentSlices.coronal / (dims[1] - 1);
                break;
                
            case 'sagittal':
                // 矢状视图：x 控制 y 坐标，y 控制 z 坐标
                this.crosshairPosition.y = x;
                this.crosshairPosition.z = y;
                // x 坐标由当前切片决定
                this.crosshairPosition.x = this.currentSlices.sagittal / (dims[0] - 1);
                break;
        }
        
        // 更新其他视图的切片位置
        this.syncSlicesWithCrosshair();
        
        // 重新渲染所有视图
        this.renderAll();
    }

    // 根据十字准星同步切片位置
    syncSlicesWithCrosshair() {
        if (!this.imageData) return;
        
        const dims = this.imageData.dimensions;
        
        // 更新各个视图的切片索引
        this.currentSlices.axial = Math.round(this.crosshairPosition.z * (dims[2] - 1));
        this.currentSlices.coronal = Math.round(this.crosshairPosition.y * (dims[1] - 1));
        this.currentSlices.sagittal = Math.round(this.crosshairPosition.x * (dims[0] - 1));
        
        // 更新切片指示器
        this.updateSliceIndicators();
    }

    // 绘制十字准星
    drawCrosshairs(ctx, canvas, plane) {
        ctx.save();
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        
        const dims = this.imageData.dimensions;
        
        // 根据视图类型计算十字准星位置
        let xPos, yPos;
        
        switch (plane) {
            case 'axial':
                // 轴向视图：显示 x,y 十字准星
                xPos = this.crosshairPosition.x * canvas.width;
                yPos = this.crosshairPosition.y * canvas.height;
                break;
                
            case 'coronal':
                // 冠状视图：显示 x 和 z 十字准星
                xPos = this.crosshairPosition.x * canvas.width;
                yPos = this.crosshairPosition.z * canvas.height;
                break;
                
            case 'sagittal':
                // 矢状视图：显示 y 和 z 十字准星
                xPos = this.crosshairPosition.y * canvas.width;
                yPos = this.crosshairPosition.z * canvas.height;
                break;
        }
        
        // 垂直線
        ctx.beginPath();
        ctx.moveTo(xPos, 0);
        ctx.lineTo(xPos, canvas.height);
        ctx.stroke();
        
        // 水平線
        ctx.beginPath();
        ctx.moveTo(0, yPos);
        ctx.lineTo(canvas.width, yPos);
        ctx.stroke();
        
        // 中心点
        ctx.fillStyle = '#00ff00';
        ctx.beginPath();
        ctx.arc(xPos, yPos, 3, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.restore();
    }

    // 绘制放大模式下的十字准星
    drawZoomCrosshairs(ctx, canvas, plane) {
        const center = this.zoomCenters[plane];
        
        ctx.save();
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.setLineDash([]); // 实线
        
        // 垂直線
        ctx.beginPath();
        ctx.moveTo(center.x * canvas.width, 0);
        ctx.lineTo(center.x * canvas.width, canvas.height);
        ctx.stroke();
        
        // 水平線
        ctx.beginPath();
        ctx.moveTo(0, center.y * canvas.height);
        ctx.lineTo(canvas.width, center.y * canvas.height);
        ctx.stroke();
        
        // 中心点
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(center.x * canvas.width, center.y * canvas.height, 4, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.restore();
    }

    // 添加平面名称辅助方法
    getPlaneName(plane) {
        const names = {
            axial: '轴状',
            coronal: '冠状', 
            sagittal: '矢状'
        };
        return names[plane] || plane;
    }

    updateSliceIndicators() {
        if (!this.imageData) return;
        const dims = this.imageData.dimensions;
        
        this.updateSliceIndicator('axial', dims[2]);
        this.updateSliceIndicator('coronal', dims[1]);
        this.updateSliceIndicator('sagittal', dims[0]);
    }

    updateSliceIndicator(plane, total) {
        const el = document.getElementById(`${plane}Slice`);
        if (el && this.imageData) {
            const dims = this.imageData.dimensions;
            const maxSlice = plane === 'axial' ? dims[2] : 
                            plane === 'coronal' ? dims[1] : 
                            dims[0];
            el.textContent = `${this.currentSlices[plane] + 1}/${maxSlice}`;
        }
    }

    reset() {
        this.imageData = null;
        this.segmentationData = null;
        this.currentSlices = { axial: 0, coronal: 0, sagittal: 0 };
        this.crosshairPosition = { x: 0.5, y: 0.5, z: 0.5 };
        this.resetZoom();
        this.renderAll();
    }
}