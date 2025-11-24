// 3d-visualization.js - 修正裁切逻辑，确保掩码居中
class ThreeDVisualization {
    constructor() {
        this.canvas = document.getElementById('threeDCanvas');
        this.context = this.canvas.getContext('2d');
        this.segmentationData = null;
        this.meshData = null;
        this.croppedData = null;
        this.croppedDimensions = null;
        this.zoomLevel = 1;
        this.rotation = { x: 0, y: 0, z: 0 };
        this.isDragging = false;
        this.lastMousePos = { x: 0, y: 0 };
        this.lightDirection = { x: 1, y: 1, z: 1 };
        
        // 裁切参数
        this.cropMargin = 40; // 裁切边距
        this.minMargin = 10;   // 最小边距
        
        // 渲染参数
        this.renderMode = 'surface';
        this.smoothing = true;
        this.zScale = 10.0; // Z轴放大一倍
        
        // 颜色配置
        this.colors = {
            1: { base: '#ff4444', specular: '#ff8888' },
            2: { base: '#44ff44', specular: '#88ff88' },  
            3: { base: '#4444ff', specular: '#8888ff' },
            4: { base: '#ffff44', specular: '#ffff88' },
            5: { base: '#ff44ff', specular: '#ff88ff' }
        };
        
        this.initialize();
    }

    initialize() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        this.bindControls();
        this.renderPlaceholder();
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();
        
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        
        this.render();
    }

    bindControls() {
        // 鼠标滚轮缩放
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = -Math.sign(e.deltaY) * 0.1;
            this.zoomLevel = Math.max(0.3, Math.min(5, this.zoomLevel + delta));
            this.render();
        });

        // 鼠标拖拽旋转
        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.lastMousePos = { x: e.clientX, y: e.clientY };
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const deltaX = e.clientX - this.lastMousePos.x;
                const deltaY = e.clientY - this.lastMousePos.y;
                
                this.rotation.y += deltaX * 0.01;
                this.rotation.x += deltaY * 0.01;
                
                this.lastMousePos = { x: e.clientX, y: e.clientY };
                this.render();
            }
        });

        this.canvas.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.isDragging = false;
        });

        // 双击重置视图
        this.canvas.addEventListener('dblclick', () => {
            this.zoomLevel = 1;
            this.rotation = { x: 0, y: 0, z: 0 };
            this.render();
        });
    }

    setSegmentationData(segmentationData, voxelSize = null) {
        this.segmentationData = segmentationData;
        
        console.log(`🎯 原始数据维度: ${segmentationData.dimensions}`);
        
        // 第一步：自动裁切XY平面
        this.applyAutoCrop(segmentationData);
        
        // 第二步：从裁切后的数据生成网格
        this.generateMeshFromSegmentation({
            data: this.croppedData,
            dimensions: this.croppedDimensions
        });
        
        this.render();
    }

    // 修正的自动裁切逻辑 - 确保四个方向都正确裁切
    applyAutoCrop(segmentationData) {
        const { data, dimensions } = segmentationData;
        const [width, height, depth] = dimensions;
        
        console.log('✂️ 开始自动裁切XY平面...');
        
        // 找到所有切片中非零掩码的边界
        let minX = width, maxX = 0;
        let minY = height, maxY = 0;
        
        // 遍历所有切片找到全局边界
        for (let z = 0; z < depth; z++) {
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (z * height + y) * width + x;
                    if (data[idx] > 0) {
                        minX = Math.min(minX, x);
                        maxX = Math.max(maxX, x);
                        minY = Math.min(minY, y);
                        maxY = Math.max(maxY, y);
                    }
                }
            }
        }
        
        console.log(`📏 掩码边界: X[${minX}, ${maxX}], Y[${minY}, ${maxY}]`);
        
        // 如果没找到有效掩码，使用整个图像
        if (minX > maxX || minY > maxY) {
            console.log('⚠️ 未找到有效掩码，使用原始尺寸');
            this.croppedData = data;
            this.croppedDimensions = dimensions;
            return;
        }
        
        // 计算掩码中心
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        
        // 计算裁切区域 - 以掩码为中心，四个方向都应用边距
        const desiredWidth = (maxX - minX) + 2 * this.cropMargin;
        const desiredHeight = (maxY - minY) + 2 * this.cropMargin;
        
        // 计算实际裁切边界，确保在图像范围内
        const cropStartX = Math.max(0, Math.floor(centerX - desiredWidth / 2));
        const cropEndX = Math.min(width - 1, Math.floor(centerX + desiredWidth / 2));
        const cropStartY = Math.max(0, Math.floor(centerY - desiredHeight / 2));
        const cropEndY = Math.min(height - 1, Math.floor(centerY + desiredHeight / 2));
        
        const croppedWidth = cropEndX - cropStartX + 1;
        const croppedHeight = cropEndY - cropStartY + 1;
        
        console.log(`✂️ 裁切区域: X[${cropStartX}, ${cropEndX}], Y[${cropStartY}, ${cropEndY}]`);
        console.log(`📐 裁切后尺寸: ${croppedWidth} x ${croppedHeight} x ${depth}`);
        console.log(`🎯 掩码中心: (${centerX.toFixed(1)}, ${centerY.toFixed(1)})`);
        console.log(`📏 裁切后掩码位置: X[${minX - cropStartX}, ${maxX - cropStartX}], Y[${minY - cropStartY}, ${maxY - cropStartY}]`);
        
        // 执行裁切
        this.croppedData = new Uint8Array(croppedWidth * croppedHeight * depth);
        this.croppedDimensions = [croppedWidth, croppedHeight, depth];
        
        for (let z = 0; z < depth; z++) {
            for (let y = 0; y < croppedHeight; y++) {
                for (let x = 0; x < croppedWidth; x++) {
                    const originalX = cropStartX + x;
                    const originalY = cropStartY + y;
                    
                    const originalIdx = (z * height + originalY) * width + originalX;
                    const croppedIdx = (z * croppedHeight + y) * croppedWidth + x;
                    
                    this.croppedData[croppedIdx] = data[originalIdx];
                }
            }
        }
        
        // 验证裁切后掩码是否居中
        this.validateCroppedMaskPosition();
        
        console.log('✅ XY平面自动裁切完成');
    }

    // 验证裁切后掩码是否居中
    validateCroppedMaskPosition() {
        if (!this.croppedData || !this.croppedDimensions) return;
        
        const [width, height, depth] = this.croppedDimensions;
        let minX = width, maxX = 0;
        let minY = height, maxY = 0;
        
        // 找到裁切后数据中的掩码边界
        for (let z = 0; z < depth; z++) {
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (z * height + y) * width + x;
                    if (this.croppedData[idx] > 0) {
                        minX = Math.min(minX, x);
                        maxX = Math.max(maxX, x);
                        minY = Math.min(minY, y);
                        maxY = Math.max(maxY, y);
                    }
                }
            }
        }
        
        if (minX > maxX || minY > maxY) {
            console.log('⚠️ 裁切后未找到有效掩码');
            return;
        }
        
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const imageCenterX = width / 2;
        const imageCenterY = height / 2;
        
        const offsetX = Math.abs(centerX - imageCenterX);
        const offsetY = Math.abs(centerY - imageCenterY);
        
        console.log(`🎯 裁切后验证: 掩码中心(${centerX.toFixed(1)}, ${centerY.toFixed(1)}), 图像中心(${imageCenterX}, ${imageCenterY})`);
        console.log(`📏 居中偏移: X=${offsetX.toFixed(1)}, Y=${offsetY.toFixed(1)}`);
        
        if (offsetX > width * 0.1 || offsetY > height * 0.1) {
            console.warn('⚠️ 警告: 裁切后掩码可能没有完全居中');
        }
    }

    // 从裁切后的数据生成网格
    generateMeshFromSegmentation(segmentationData) {
        const { data, dimensions } = segmentationData;
        const [width, height, depth] = dimensions;
        
        console.log('🔄 生成3D网格...');
        
        this.meshData = {
            vertices: [],
            faces: [],
            colors: [],
            normals: []
        };
        
        // 为每个类别生成表面网格
        const classes = [1, 2, 3, 4, 5];
        
        classes.forEach(classId => {
            const surface = this.extractSurfaceForClass(data, dimensions, classId);
            if (surface.vertices.length > 0) {
                const offset = this.meshData.vertices.length / 3;
                
                this.meshData.vertices.push(...surface.vertices);
                
                surface.faces.forEach(face => {
                    this.meshData.faces.push([
                        face[0] + offset,
                        face[1] + offset, 
                        face[2] + offset
                    ]);
                });
                
                for (let i = 0; i < surface.vertices.length / 3; i++) {
                    this.meshData.colors.push(classId);
                    this.meshData.normals.push(...surface.normals.slice(i * 3, i * 3 + 3));
                }
            }
        });
        
        console.log(`✅ 网格生成完成: ${this.meshData.vertices.length/3} 顶点, ${this.meshData.faces.length} 面`);
    }

    // 为特定类别提取表面
    extractSurfaceForClass(data, dimensions, classId) {
        const [width, height, depth] = dimensions;
        const vertices = [];
        const faces = [];
        const normals = [];
        
        const threshold = 0.5;
        const step = 2; // 采样步长
        
        // 遍历裁切后的体数据寻找边界体素
        for (let z = 1; z < depth - 1; z += step) {
            for (let y = 1; y < height - 1; y += step) {
                for (let x = 1; x < width - 1; x += step) {
                    const idx = (z * height + y) * width + x;
                    
                    if (data[idx] === classId) {
                        if (this.isBoundaryVoxel(data, dimensions, x, y, z, classId)) {
                            this.generateVoxelGeometry(vertices, faces, normals, x, y, z, classId, step);
                        }
                    }
                }
            }
        }
        
        return { vertices, faces, normals };
    }

    // 检查是否为边界体素
    isBoundaryVoxel(data, dimensions, x, y, z, classId) {
        const [width, height, depth] = dimensions;
        
        const neighbors = [
            [x-1, y, z], [x+1, y, z],
            [x, y-1, z], [x, y+1, z], 
            [x, y, z-1], [x, y, z+1]
        ];
        
        for (const [nx, ny, nz] of neighbors) {
            if (nx >= 0 && nx < width && ny >= 0 && ny < height && nz >= 0 && nz < depth) {
                const nIdx = (nz * height + ny) * width + nx;
                if (data[nIdx] !== classId) {
                    return true;
                }
            }
        }
        return false;
    }

    // 为体素生成立方体几何（应用Z轴放大）
    generateVoxelGeometry(vertices, faces, normals, x, y, z, classId, step) {
        const size = step * 0.8;
        const halfSize = size / 2;
        
        // 立方体的8个顶点（应用Z轴放大一倍）
        const cubeVertices = [
            [x - halfSize, y - halfSize, (z - halfSize) * this.zScale],
            [x + halfSize, y - halfSize, (z - halfSize) * this.zScale],
            [x + halfSize, y + halfSize, (z - halfSize) * this.zScale],
            [x - halfSize, y + halfSize, (z - halfSize) * this.zScale],
            [x - halfSize, y - halfSize, (z + halfSize) * this.zScale],
            [x + halfSize, y - halfSize, (z + halfSize) * this.zScale],
            [x + halfSize, y + halfSize, (z + halfSize) * this.zScale],
            [x - halfSize, y + halfSize, (z + halfSize) * this.zScale]
        ];
        
        // 立方体的6个面（12个三角形）
        const cubeFaces = [
            [0, 1, 2], [0, 2, 3], // 前面
            [4, 5, 6], [4, 6, 7], // 后面
            [0, 4, 7], [0, 7, 3], // 左面
            [1, 5, 6], [1, 6, 2], // 右面
            [0, 1, 5], [0, 5, 4], // 下面
            [3, 2, 6], [3, 6, 7]  // 上面
        ];
        
        // 每个面的法线
        const faceNormals = [
            [0, 0, -1], [0, 0, -1],
            [0, 0, 1], [0, 0, 1],
            [-1, 0, 0], [-1, 0, 0],
            [1, 0, 0], [1, 0, 0],
            [0, -1, 0], [0, -1, 0],
            [0, 1, 0], [0, 1, 0]
        ];
        
        const vertexOffset = vertices.length / 3;
        
        cubeVertices.forEach(vertex => {
            vertices.push(...vertex);
        });
        
        cubeFaces.forEach(face => {
            faces.push([
                face[0] + vertexOffset,
                face[1] + vertexOffset,
                face[2] + vertexOffset
            ]);
        });
        
        faceNormals.forEach(normal => {
            normals.push(...normal);
            normals.push(...normal);
            normals.push(...normal);
        });
    }

    render() {
        if (!this.meshData || this.meshData.vertices.length === 0) {
            this.renderPlaceholder();
            return;
        }

        const ctx = this.context;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        ctx.clearRect(0, 0, width, height);
        
        // 绘制渐变背景
        const gradient = ctx.createRadialGradient(
            width/2, height/2, 0,
            width/2, height/2, Math.max(width, height)/2
        );
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(1, '#16213e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        
        this.renderMesh(ctx, width, height);
        this.drawControlsHint(ctx, width, height);
    }

    renderMesh(ctx, width, height) {
        const centerX = width / 2;
        const centerY = height / 2;
        
        // 根据裁切后的尺寸计算缩放比例
        const [croppedWidth, croppedHeight, croppedDepth] = this.croppedDimensions;
        const maxDimension = Math.max(croppedWidth, croppedHeight, croppedDepth * this.zScale);
        const scale = Math.min(width, height) * 0.002 * this.zoomLevel;
        
        ctx.save();
        ctx.translate(centerX, centerY);
        
        const cosX = Math.cos(this.rotation.x);
        const sinX = Math.sin(this.rotation.x);
        const cosY = Math.cos(this.rotation.y);
        const sinY = Math.sin(this.rotation.y);
        
        const transformedVertices = [];
        const depths = [];
        
        for (let i = 0; i < this.meshData.vertices.length; i += 3) {
            let x = this.meshData.vertices[i] * scale;
            let y = this.meshData.vertices[i + 1] * scale;
            let z = this.meshData.vertices[i + 2] * scale;
            
            // 应用旋转
            const x1 = x * cosY - z * sinY;
            const z1 = x * sinY + z * cosY;
            
            const y1 = y * cosX - z1 * sinX;
            const z2 = y * sinX + z1 * cosX;
            
            transformedVertices.push(x1, y1, z2);
            depths.push(z2);
        }
        
        // 根据面中心深度排序
        const facesWithDepth = this.meshData.faces.map((face, index) => {
            const depth = (depths[face[0]] + depths[face[1]] + depths[face[2]]) / 3;
            return { face, depth, index };
        });
        
        facesWithDepth.sort((a, b) => b.depth - a.depth);
        
        // 渲染每个面
        facesWithDepth.forEach(({ face, depth }) => {
            this.renderFace(ctx, transformedVertices, face, depth);
        });
        
        ctx.restore();
    }

    renderFace(ctx, vertices, face, depth) {
        const [v0, v1, v2] = face;
        const classId = this.meshData.colors[v0];
        const colorInfo = this.colors[classId];
        
        if (!colorInfo) return;
        
        const x0 = vertices[v0 * 3];
        const y0 = vertices[v0 * 3 + 1];
        const x1 = vertices[v1 * 3];
        const y1 = vertices[v1 * 3 + 1];
        const x2 = vertices[v2 * 3];
        const y2 = vertices[v2 * 3 + 1];
        
        const normal = this.calculateFaceNormal(vertices, v0, v1, v2);
        const lightIntensity = this.calculateLighting(normal, this.lightDirection);
        
        const baseColor = this.hexToRgb(colorInfo.base);
        const shadedColor = this.applyLighting(baseColor, lightIntensity, 0.3, 0.7);
        
        const alpha = 0.6 + 0.4 * (1 - Math.max(0, Math.min(1, (depth + 200) / 400)));
        
        if (this.renderMode === 'wireframe') {
            ctx.strokeStyle = `rgba(${shadedColor.r}, ${shadedColor.g}, ${shadedColor.b}, ${alpha * 0.5})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.closePath();
            ctx.stroke();
        } else {
            ctx.fillStyle = `rgba(${shadedColor.r}, ${shadedColor.g}, ${shadedColor.b}, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.closePath();
            ctx.fill();
            
            ctx.strokeStyle = `rgba(${shadedColor.r * 0.7}, ${shadedColor.g * 0.7}, ${shadedColor.b * 0.7}, ${alpha * 0.8})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }
    }

    calculateFaceNormal(vertices, v0, v1, v2) {
        const x0 = vertices[v0 * 3], y0 = vertices[v0 * 3 + 1], z0 = vertices[v0 * 3 + 2];
        const x1 = vertices[v1 * 3], y1 = vertices[v1 * 3 + 1], z1 = vertices[v1 * 3 + 2];
        const x2 = vertices[v2 * 3], y2 = vertices[v2 * 3 + 1], z2 = vertices[v2 * 3 + 2];
        
        const ux = x1 - x0, uy = y1 - y0, uz = z1 - z0;
        const vx = x2 - x0, vy = y2 - y0, vz = z2 - z0;
        
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        
        const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (length === 0) return { x: 0, y: 0, z: 1 };
        
        return {
            x: nx / length,
            y: ny / length, 
            z: nz / length
        };
    }

    calculateLighting(normal, lightDir) {
        const lightLength = Math.sqrt(lightDir.x * lightDir.x + lightDir.y * lightDir.y + lightDir.z * lightDir.z);
        const normalizedLight = {
            x: lightDir.x / lightLength,
            y: lightDir.y / lightLength,
            z: lightDir.z / lightLength
        };
        
        const dot = normal.x * normalizedLight.x + normal.y * normalizedLight.y + normal.z * normalizedLight.z;
        
        return Math.max(0, dot);
    }

    applyLighting(baseColor, intensity, ambient, diffuse) {
        const r = Math.min(255, Math.floor(baseColor.r * (ambient + diffuse * intensity)));
        const g = Math.min(255, Math.floor(baseColor.g * (ambient + diffuse * intensity)));
        const b = Math.min(255, Math.floor(baseColor.b * (ambient + diffuse * intensity)));
        
        return { r, g, b };
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    drawControlsHint(ctx, width, height) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = '12px Arial';
        ctx.textAlign = 'left';
        
        const originalDims = this.segmentationData ? this.segmentationData.dimensions : [0, 0, 0];
        const croppedDims = this.croppedDimensions || [0, 0, 0];
        
        const hints = [
            '鼠标拖拽: 旋转视图',
            '滚轮: 缩放',
            '双击: 重置视图',
            `Z轴缩放: ${this.zScale.toFixed(1)}x`,
            `原始尺寸: ${originalDims[0]}×${originalDims[1]}×${originalDims[2]}`,
            `裁切尺寸: ${croppedDims[0]}×${croppedDims[1]}×${croppedDims[2]}`
        ];
        
        hints.forEach((hint, index) => {
            ctx.fillText(hint, 10, 20 + index * 18);
        });
        
        ctx.textAlign = 'right';
        ctx.fillText(
            `缩放: ${this.zoomLevel.toFixed(1)}x | 旋转: X:${(this.rotation.x * 180 / Math.PI).toFixed(0)}° Y:${(this.rotation.y * 180 / Math.PI).toFixed(0)}°`, 
            width - 10, 
            height - 10
        );
    }

    renderPlaceholder() {
        const ctx = this.context;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        ctx.clearRect(0, 0, width, height);
        
        const gradient = ctx.createRadialGradient(
            width/2, height/2, 0,
            width/2, height/2, Math.max(width, height)/2
        );
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(1, '#16213e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        
        ctx.fillStyle = '#7f8c8d';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.fillText('3D 分割结果可视化', width / 2, height / 2 - 30);
        ctx.font = '14px Arial';
        ctx.fillText('完成分割后显示3D渲染', width / 2, height / 2);
        ctx.fillText('鼠标拖拽旋转 | 滚轮缩放 | 双击重置', width / 2, height / 2 + 30);
    }

    // 设置Z轴缩放
    setZScale(scale) {
        this.zScale = Math.max(0.5, Math.min(5, scale));
        
        if (this.segmentationData) {
            // 重新应用裁切和网格生成
            this.applyAutoCrop(this.segmentationData);
            this.generateMeshFromSegmentation({
                data: this.croppedData,
                dimensions: this.croppedDimensions
            });
            this.render();
        }
    }

    // 设置裁切边距
    setCropMargin(margin) {
        this.cropMargin = Math.max(10, Math.min(500, margin));
        
        if (this.segmentationData) {
            // 重新应用裁切和网格生成
            this.applyAutoCrop(this.segmentationData);
            this.generateMeshFromSegmentation({
                data: this.croppedData,
                dimensions: this.croppedDimensions
            });
            this.render();
        }
    }

    setRenderMode(mode) {
        this.renderMode = mode;
        if (this.segmentationData) {
            this.render();
        }
    }
}