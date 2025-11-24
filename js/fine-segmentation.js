// fine-segmentation.js - 使用独立ONNX Runtime的完整修复版本
class FineSegmentation {
    constructor() {
        this.isInitialized = false;
        this.modelPath = './models/fine_model.onnx';
        this.fineSession = null;
        this.debugMode = true;
        this.ort = null; // 独立的ONNX Runtime实例
    }

    async initialize() {
        if (this.isInitialized) return;
        
        console.log('🔧 初始化精细分割模块...');
        try {
            // 动态加载最新版ONNX Runtime
            await this.loadLatestONNXRuntime();
            await this.loadFineModel();
            this.isInitialized = true;
            console.log('✅ 精细分割模块初始化完成');
        } catch (error) {
            console.error('❌ 精细分割模块初始化失败:', error);
            throw error;
        }
    }

    // 动态加载最新版ONNX Runtime
    async loadLatestONNXRuntime() {
        console.log('📥 加载最新版ONNX Runtime...');
        
        // 检查是否已经加载了全局ort（粗分割使用的）
        if (window.ort && window.ort.InferenceSession) {
            console.log('⚠️ 检测到全局ONNX Runtime，将使用独立版本');
        }
        
        try {
            // 动态加载最新版ONNX Runtime
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@latest/dist/ort.min.js';
            script.crossOrigin = 'anonymous';
            
            await new Promise((resolve, reject) => {
                script.onload = () => {
                    console.log('✅ 最新版ONNX Runtime脚本加载成功');
                    // 使用最新版的ort
                    this.ort = window.ort;
                    resolve();
                };
                script.onerror = () => {
                    console.error('❌ 加载最新版ONNX Runtime失败');
                    reject(new Error('加载ONNX Runtime失败'));
                };
                document.head.appendChild(script);
            });
            
            console.log('✅ 最新版ONNX Runtime加载成功');
            
        } catch (error) {
            console.error('❌ 加载最新版ONNX Runtime失败:', error);
            
            // 回退到全局版本
            if (typeof ort !== 'undefined') {
                console.log('🔄 回退到全局ONNX Runtime');
                this.ort = ort;
            } else {
                throw new Error('无法加载ONNX Runtime');
            }
        }
    }

    async loadFineModel() {
        console.log('📥 加载精细分割模型...');
        
        if (!this.ort) {
            throw new Error('ONNX Runtime 未加载');
        }
        
        console.log('✅ ONNX Runtime 已加载');
        
        try {
            const backendsToTry = [
                ['webgl'], // 优先尝试WebGL
                ['wasm'],
                ['webgl', 'wasm'],
            ];
            
            let lastError = null;
            
            for (const backends of backendsToTry) {
                try {
                    console.log(`🔄 尝试后端: ${backends.join(', ')}`);
                    
                    const options = {
                        executionProviders: backends,
                        logSeverityLevel: 3,
                        graphOptimizationLevel: 'all',
                        enableCpuMemArena: true,
                        enableMemPattern: true,
                        executionMode: 'sequential'
                    };
                    
                    console.log('📁 模型路径:', this.modelPath);
                    
                    const response = await fetch(this.modelPath, { method: 'HEAD' });
                    if (!response.ok) {
                        throw new Error(`模型文件不存在或无法访问: ${this.modelPath}`);
                    }
                    console.log('✅ 模型文件存在');
                    
                    this.fineSession = await this.ort.InferenceSession.create(this.modelPath, options);
                    console.log(`🎉 精细分割模型加载成功! 使用后端: ${backends.join(', ')}`);
                    
                    // 记录模型信息用于调试
                    this.logFineModelDetails();
                    
                    this.isInitialized = true;
                    return;
                    
                } catch (error) {
                    lastError = error;
                    console.warn(`❌ 后端 ${backends.join(', ')} 失败:`, error.message);
                    continue;
                }
            }
            
            const allBackendsFailedMsg = `所有后端都失败。最后错误: ${lastError?.message}`;
            console.error('❌ ' + allBackendsFailedMsg);
            throw new Error(allBackendsFailedMsg);
            
        } catch (error) {
            console.error('❌ 精细分割模型加载失败:', error);
            throw error;
        }
    }

    // 记录精细分割模型详细信息
    logFineModelDetails() {
        if (!this.fineSession) return;
        
        console.log('🔍 精细分割模型信息:');
        console.log('- 输入名称:', this.fineSession.inputNames);
        console.log('- 输出名称:', this.fineSession.outputNames);
        
        if (this.fineSession.inputs && this.fineSession.inputs.length > 0) {
            console.log('🔍 精细模型输入详细信息:');
            this.fineSession.inputs.forEach((input, index) => {
                console.log(`  输入 ${index}:`, {
                    名称: input.name,
                    形状: input.dims,
                    类型: input.type
                });
            });
        }
        
        if (this.fineSession.outputs && this.fineSession.outputs.length > 0) {
            console.log('🔍 精细模型输出详细信息:');
            this.fineSession.outputs.forEach((output, index) => {
                console.log(`  输出 ${index}:`, {
                    名称: output.name,
                    形状: output.dims,
                    类型: output.type
                });
            });
        }
    }

    async runFineSegmentation(originalImages, coarseResult, progressCallback) {
        if (!this.isInitialized) await this.initialize();

        console.log('🎯 开始精细分割...');
        progressCallback(10, '准备精细分割数据...');

        try {
            // 确保粗分割结果的体素间距与C0一致
            const coarseResultWithC0Spacing = {
                ...coarseResult,
                voxelSize: originalImages.c0.voxelSize
            };
            
            console.log('📏 确保粗分割结果体素间距与C0一致:', coarseResultWithC0Spacing.voxelSize);

            // 1. 根据粗分割结果裁切图像
            progressCallback(20, '基于粗分割结果裁切图像...');
            const croppedData = this.cropBasedOnCoarseSegmentation(
                originalImages, 
                coarseResultWithC0Spacing, // 使用带有正确体素间距的粗分割结果
                originalImages.c0.voxelSize // 使用C0的体素间距
            );
            
            // 2. 预处理裁切后的数据（严格按照Python版本）
            progressCallback(40, '预处理四模态数据...');
            const preprocessedData = this.preprocessIdenticalToPython(croppedData);
            
            // 3. 运行精细分割推理（2D逐片处理）
            progressCallback(60, '运行精细分割模型...');
            const fineResult = await this.runFineInference2DIdenticalToPython(preprocessedData);
            
            // 4. 后处理并将结果映射回原始空间
            progressCallback(80, '后处理结果...');
            const finalResult = this.postprocessFineResult(
                fineResult, 
                coarseResultWithC0Spacing, 
                croppedData.cropInfo,
                originalImages.c0.voxelSize // 使用C0的体素间距
            );

            progressCallback(100, '精细分割完成');
            return finalResult;

        } catch (error) {
            console.error('❌ 精细分割失败:', error);
            throw error;
        }
    }

    // 严格按照Python版本的预处理
    preprocessIdenticalToPython(croppedData) {
        const { images, coarse } = croppedData;
        const [width, height, depth] = coarse.dimensions;
        
        console.log('🔧 严格按照Python版本预处理四模态数据...');
        console.log(`📐 裁切后尺寸: ${width}x${height}x${depth}`);

        // 1. 对前3个图像通道进行z-score归一化（与Python完全一致）
        const processedChannels = [];
        
        // 通道0: C0
        console.log('📊 归一化 C0 通道...');
        const c0Normalized = this.zscoreNormalize(images.c0.data);
        processedChannels.push(c0Normalized);
        
        // 通道1: DE  
        console.log('📊 归一化 DE 通道...');
        const deNormalized = this.zscoreNormalize(images.de.data);
        processedChannels.push(deNormalized);
        
        // 通道2: T2
        console.log('📊 归一化 T2 通道...');
        const t2Normalized = this.zscoreNormalize(images.t2.data);
        processedChannels.push(t2Normalized);
        
        // 通道3: 粗分割结果（保持原样，不归一化）
        console.log('📊 处理粗分割通道...');
        const coarseFloat = new Float32Array(coarse.data.length);
        for (let i = 0; i < coarse.data.length; i++) {
            coarseFloat[i] = coarse.data[i];
        }
        processedChannels.push(coarseFloat);

        // 2. 构建4D体积 [4, depth, height, width]（与Python完全一致）
        const volume4D = this.build4DVolume(processedChannels, [depth, height, width]);
        
        console.log(`📦 构建4D体积: 形状[4,${depth},${height},${width}], 长度: ${volume4D.length}`);

        return {
            data: volume4D,
            dims: [4, depth, height, width],
            originalShape: [depth, height, width],
            cropInfo: croppedData.cropInfo
        };
    }

    // z-score归一化（与Python完全一致）
    zscoreNormalize(data) {
        // 计算均值和标准差
        let sum = 0;
        let sumSq = 0;
        const len = data.length;
        
        for (let i = 0; i < len; i++) {
            sum += data[i];
            sumSq += data[i] * data[i];
        }
        
        const mean = sum / len;
        const std = Math.sqrt(sumSq / len - mean * mean);
        
        console.log(`📊 z-score归一化 - 均值: ${mean.toFixed(4)}, 标准差: ${std.toFixed(4)}`);
        
        // 应用归一化
        const normalized = new Float32Array(len);
        for (let i = 0; i < len; i++) {
            normalized[i] = (data[i] - mean) / (std + 1e-8);
        }
        
        return normalized;
    }

    // 构建4D体积 [channels, depth, height, width]（与Python完全一致）
    build4DVolume(channels, shape) {
        const [depth, height, width] = shape;
        const numChannels = channels.length;
        const totalSize = numChannels * depth * height * width;
        const volume = new Float32Array(totalSize);
        
        console.log(`🔄 构建4D体积: ${numChannels}x${depth}x${height}x${width}`);
        
        let idx = 0;
        for (let c = 0; c < numChannels; c++) {
            const channelData = channels[c];
            for (let z = 0; z < depth; z++) {
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const voxelIndex = (z * height + y) * width + x;
                        volume[idx] = channelData[voxelIndex];
                        idx++;
                    }
                }
            }
        }
        
        return volume;
    }

    // 严格按照Python版本的2D推理
    async runFineInference2DIdenticalToPython(preprocessedData) {
        if (!this.fineSession) {
            throw new Error('精细分割模型未加载');
        }

        console.log('🎯 严格按照Python版本运行2D精细分割推理...');
        const { data, dims, originalShape, cropInfo } = preprocessedData;
        
        const [channels, depth, height, width] = dims;
        
        console.log(`📦 输入数据: 形状[${dims}], 长度: ${data.length}`);
        console.log(`🔍 原始形状: [${originalShape}]`);

        // 验证数据长度
        const expectedLength = channels * depth * height * width;
        if (data.length !== expectedLength) {
            console.error(`❌ 数据长度不匹配: 期望 ${expectedLength}, 实际 ${data.length}`);
            throw new Error(`数据预处理错误: 长度不匹配`);
        }

        const allSegmentations = [];

        // 对每个深度切片进行2D推理（与Python完全一致）
        for (let sliceIdx = 0; sliceIdx < depth; sliceIdx++) {
            console.log(`  处理切片 ${sliceIdx + 1}/${depth}`);
            
            // 提取当前2D切片 [4, height, width]（与Python完全一致）
            const sliceData = this.extract2DSliceIdenticalToPython(data, dims, sliceIdx);
            
            console.log(`🔍 切片数据: 形状[${sliceData.dims}], 长度: ${sliceData.data.length}`);

            // 验证切片数据
            if (sliceData.data.length === 0) {
                console.error(`❌ 切片 ${sliceIdx} 数据为空`);
                throw new Error(`切片数据提取失败`);
            }

            try {
                // 对切片进行填充到32的倍数
                const paddedSliceData = this.padSliceTo32Multiple(sliceData);
                console.log(`📦 切片填充: [${sliceData.dims}] -> [${paddedSliceData.dims}]`);

                // 严格按照Python版本：添加batch维度 [1, 4, padded_height, padded_width]
                const inputDims = [1, ...paddedSliceData.dims];
                console.log(`🔄 使用模型期望形状: [${inputDims}]`);
                
                // 使用独立的ort实例创建Tensor
                const inputTensor = new this.ort.Tensor('float32', paddedSliceData.data, inputDims);
                const inputName = this.fineSession.inputNames[0];

                console.log('🎯 执行模型推理...');
                const output = await this.fineSession.run({ [inputName]: inputTensor });
                const outputName = this.fineSession.outputNames[0];
                
                let outputData = output[outputName].data;
                let outputDims = output[outputName].dims;
                
                console.log(`✅ 切片 ${sliceIdx + 1} 推理成功，输出形状: [${outputDims}]`);

                // 移除填充，恢复到原始尺寸
                const unpaddedOutput = this.unpadOutputToOriginalSize(outputData, outputDims, [height, width]);
                console.log(`✂️ 输出去除填充: [${outputDims}] -> [${unpaddedOutput.dims}]`);

                // 转换为分割掩码（考虑batch维度）
                const segmentation = this.convert2DToSegmentationWithBatch(
                    unpaddedOutput.data, 
                    unpaddedOutput.dims, 
                    [height, width]
                );
                allSegmentations.push(segmentation);
                
            } catch (error) {
                console.error(`❌ 切片 ${sliceIdx + 1} 推理失败:`, error);
                throw error;
            }
        }

        // 组合所有切片为3D体积
        const volumeSeg = this.combine2DSlicesTo3D(allSegmentations, [width, height, depth]);
        
        console.log(`✅ 2D精细分割推理完成`);
        
        return {
            data: volumeSeg,
            dims: [depth, height, width],
            originalShape: originalShape,
            cropInfo: cropInfo
        };
    }

    // 将切片填充到32的倍数
    padSliceTo32Multiple(sliceData) {
        const [channels, height, width] = sliceData.dims;
        
        // 计算填充后的尺寸（向上取整到32的倍数）
        const paddedHeight = Math.ceil(height / 32) * 32;
        const paddedWidth = Math.ceil(width / 32) * 32;
        
        // 如果不需要填充，直接返回
        if (paddedHeight === height && paddedWidth === width) {
            return sliceData;
        }
        
        console.log(`📦 填充切片: ${height}x${width} -> ${paddedHeight}x${paddedWidth}`);
        
        // 创建填充后的数组（用0填充）
        const totalSize = channels * paddedHeight * paddedWidth;
        const paddedData = new Float32Array(totalSize);
        paddedData.fill(0);
        
        // 将原始数据复制到填充数组的左上角
        for (let c = 0; c < channels; c++) {
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const srcIdx = (c * height + y) * width + x;
                    const dstIdx = (c * paddedHeight + y) * paddedWidth + x;
                    paddedData[dstIdx] = sliceData.data[srcIdx];
                }
            }
        }
        
        return {
            data: paddedData,
            dims: [channels, paddedHeight, paddedWidth]
        };
    }

    // 移除输出中的填充，恢复到原始尺寸
    unpadOutputToOriginalSize(outputData, outputDims, originalSize) {
        const [batch, classes, paddedHeight, paddedWidth] = outputDims;
        const [originalHeight, originalWidth] = originalSize;
        
        // 如果不需要去除填充，直接返回
        if (paddedHeight === originalHeight && paddedWidth === originalWidth) {
            return {
                data: outputData,
                dims: outputDims
            };
        }
        
        console.log(`✂️ 去除输出填充: ${paddedHeight}x${paddedWidth} -> ${originalHeight}x${originalWidth}`);
        
        // 创建去除填充后的数组
        const totalSize = batch * classes * originalHeight * originalWidth;
        const unpaddedData = new Float32Array(totalSize);
        
        // 从填充数据的左上角提取原始尺寸的数据
        for (let b = 0; b < batch; b++) {
            for (let c = 0; c < classes; c++) {
                for (let y = 0; y < originalHeight; y++) {
                    for (let x = 0; x < originalWidth; x++) {
                        const srcIdx = ((b * classes + c) * paddedHeight + y) * paddedWidth + x;
                        const dstIdx = ((b * classes + c) * originalHeight + y) * originalWidth + x;
                        unpaddedData[dstIdx] = outputData[srcIdx];
                    }
                }
            }
        }
        
        return {
            data: unpaddedData,
            dims: [batch, classes, originalHeight, originalWidth]
        };
    }

    // 严格按照Python版本的2D切片提取
    extract2DSliceIdenticalToPython(volumeData, volumeDims, sliceIndex) {
        const [channels, depth, height, width] = volumeDims;
        const sliceSize = channels * height * width;
        const sliceData = new Float32Array(sliceSize);
        
        // 从 [channels, depth, height, width] 中提取指定深度的切片 [channels, height, width]
        let idx = 0;
        for (let c = 0; c < channels; c++) {
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const srcIdx = ((c * depth + sliceIndex) * height + y) * width + x;
                    sliceData[idx] = volumeData[srcIdx];
                    idx++;
                }
            }
        }
        
        return {
            data: sliceData,
            dims: [channels, height, width]
        };
    }

    // 考虑batch维度的分割掩码转换
    convert2DToSegmentationWithBatch(outputData, outputDims, sliceShape) {
        const [batch, classes, height, width] = outputDims;
        const [sliceHeight, sliceWidth] = sliceShape;
        
        const segmentation = new Uint8Array(sliceHeight * sliceWidth);
        
        // 只处理第一个batch（batch=0）
        const batchOffset = 0 * classes * height * width;
        
        // 对每个像素取argmax
        for (let i = 0; i < sliceHeight * sliceWidth; i++) {
            let maxProb = -Infinity;
            let bestClass = 0;
            
            for (let c = 0; c < classes; c++) {
                const probIndex = batchOffset + c * sliceHeight * sliceWidth + i;
                if (probIndex < outputData.length) {
                    const prob = outputData[probIndex];
                    if (prob > maxProb) {
                        maxProb = prob;
                        bestClass = c;
                    }
                }
            }
            
            segmentation[i] = bestClass;
        }
        
        return segmentation;
    }

    // 组合2D切片为3D体积
    combine2DSlicesTo3D(slices, volumeShape) {
        const [width, height, depth] = volumeShape;
        const totalVoxels = width * height * depth;
        const volumeData = new Uint8Array(totalVoxels);
        
        for (let z = 0; z < depth; z++) {
            const slice = slices[z];
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const sliceIdx = y * width + x;
                    const volumeIdx = (z * height + y) * width + x;
                    
                    if (sliceIdx < slice.length) {
                        volumeData[volumeIdx] = slice[sliceIdx];
                    }
                }
            }
        }
        
        return volumeData;
    }

    cropBasedOnCoarseSegmentation(originalImages, coarseResult, voxelSize = null) {
        const { data: coarseData, dimensions: coarseDims } = coarseResult;
        const [width, height, depth] = coarseDims;
        
        console.log('✂️ 基于粗分割结果裁切图像...');
        console.log('📏 使用的体素间距:', voxelSize);

        // 找到非零区域的边界框
        const bbox = this.findBoundingBox(coarseData, coarseDims);
        
        // 添加边界margin（考虑体素间距）
        const margin = this.calculateMarginWithSpacing(bbox, voxelSize);
        const cropCoords = {
            minZ: Math.max(0, bbox.minZ - margin[0]),
            maxZ: Math.min(depth - 1, bbox.maxZ + margin[0]),
            minY: Math.max(0, bbox.minY - margin[1]),
            maxY: Math.min(height - 1, bbox.maxY + margin[1]),
            minX: Math.max(0, bbox.minX - margin[2]),
            maxX: Math.min(width - 1, bbox.maxX + margin[2])
        };

        console.log('裁切坐标:', cropCoords);
        console.log('裁切后尺寸:', {
            width: cropCoords.maxX - cropCoords.minX + 1,
            height: cropCoords.maxY - cropCoords.minY + 1,
            depth: cropCoords.maxZ - cropCoords.minZ + 1
        });

        // 裁切所有模态的图像
        const croppedImages = {};
        for (const [modality, imageData] of Object.entries(originalImages)) {
            croppedImages[modality] = this.cropImageVolume(
                imageData.rawData, 
                imageData.dimensions, 
                cropCoords
            );
        }

        // 裁切粗分割结果作为第四模态
        const croppedCoarse = this.cropImageVolume(
            coarseData, 
            coarseDims, 
            cropCoords
        );

        return {
            images: croppedImages,
            coarse: croppedCoarse,
            cropInfo: {
                coords: cropCoords,
                originalDims: coarseDims,
                voxelSize: voxelSize
            }
        };
    }

    findBoundingBox(data, dimensions) {
        const [width, height, depth] = dimensions;
        let minX = width, maxX = 0, minY = height, maxY = 0, minZ = depth, maxZ = 0;
        let found = false;

        for (let z = 0; z < depth; z++) {
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (z * height + y) * width + x;
                    if (data[idx] > 0) {
                        found = true;
                        minX = Math.min(minX, x);
                        maxX = Math.max(maxX, x);
                        minY = Math.min(minY, y);
                        maxY = Math.max(maxY, y);
                        minZ = Math.min(minZ, z);
                        maxZ = Math.max(maxZ, z);
                    }
                }
            }
        }

        if (!found) {
            throw new Error('粗分割结果中没有找到有效的分割区域');
        }

        console.log(`📦 找到边界框: X[${minX}-${maxX}], Y[${minY}-${maxY}], Z[${minZ}-${maxZ}]`);
        return { minX, maxX, minY, maxY, minZ, maxZ };
    }

    calculateMarginWithSpacing(bbox, voxelSize) {
        const defaultMargin = [2, 15, 15];
        
        if (!voxelSize) {
            return defaultMargin;
        }
        
        const targetPhysicalMargin = [5, 10, 10];
        
        const marginInVoxels = [
            Math.round(targetPhysicalMargin[0] / (voxelSize[2] || 1)),
            Math.round(targetPhysicalMargin[1] / (voxelSize[1] || 1)),
            Math.round(targetPhysicalMargin[2] / (voxelSize[0] || 1))
        ];
        
        console.log(`📏 基于体素间距计算边界:`, {
            体素间距: voxelSize,
            目标物理边界: targetPhysicalMargin,
            计算出的体素边界: marginInVoxels
        });
        
        return marginInVoxels;
    }

    cropImageVolume(data, dimensions, cropCoords) {
        const [width, height, depth] = dimensions;
        const { minX, maxX, minY, maxY, minZ, maxZ } = cropCoords;
        
        const croppedWidth = maxX - minX + 1;
        const croppedHeight = maxY - minY + 1;
        const croppedDepth = maxZ - minZ + 1;
        
        console.log(`✂️ 裁切体积: ${width}x${height}x${depth} -> ${croppedWidth}x${croppedHeight}x${croppedDepth}`);
        
        const croppedData = new Float32Array(croppedDepth * croppedHeight * croppedWidth);
        
        for (let z = 0; z < croppedDepth; z++) {
            for (let y = 0; y < croppedHeight; y++) {
                for (let x = 0; x < croppedWidth; x++) {
                    const origZ = z + minZ;
                    const origY = y + minY;
                    const origX = x + minX;
                    
                    const srcIdx = (origZ * height + origY) * width + origX;
                    const dstIdx = (z * croppedHeight + y) * croppedWidth + x;
                    
                    if (srcIdx >= 0 && srcIdx < data.length) {
                        croppedData[dstIdx] = data[srcIdx];
                    } else {
                        croppedData[dstIdx] = 0;
                    }
                }
            }
        }
        
        return {
            data: croppedData,
            dimensions: [croppedWidth, croppedHeight, croppedDepth]
        };
    }

    postprocessFineResult(fineResult, originalCoarse, cropInfo, voxelSize = null) {
        const { data, dims, originalShape } = fineResult;
        const [depth, height, width] = originalShape;
        
        console.log('🔧 后处理精细分割结果...');
        console.log('📏 使用的体素间距:', voxelSize);

        const segmentation = {
            data: data,
            dimensions: [width, height, depth],
            numClasses: 6,
            voxelSize: voxelSize
        };
        
        const restoredSegmentation = this.restoreToOriginalSpace(segmentation, cropInfo);
        const finalResult = this.applyFinePostprocessing(restoredSegmentation);
        
        // 确保最终结果包含正确的体素间距信息
        if (voxelSize) {
            finalResult.voxelSize = voxelSize;
        }
        
        return finalResult;
    }

    restoreToOriginalSpace(segmentation, cropInfo) {
        const { coords, originalDims } = cropInfo;
        const [origWidth, origHeight, origDepth] = originalDims;
        const [cropWidth, cropHeight, cropDepth] = segmentation.dimensions;
        const { minX, maxX, minY, maxY, minZ, maxZ } = coords;
        
        console.log(`🔄 映射回原始空间: ${cropWidth}x${cropHeight}x${cropDepth} -> ${origWidth}x${origHeight}x${origDepth}`);
        
        const restoredData = new Uint8Array(origWidth * origHeight * origDepth);
        
        for (let z = 0; z < cropDepth; z++) {
            for (let y = 0; y < cropHeight; y++) {
                for (let x = 0; x < cropWidth; x++) {
                    const srcIdx = (z * cropHeight + y) * cropWidth + x;
                    const dstZ = z + minZ;
                    const dstY = y + minY;
                    const dstX = x + minX;
                    
                    if (dstZ < origDepth && dstY < origHeight && dstX < origWidth) {
                        const dstIdx = (dstZ * origHeight + dstY) * origWidth + dstX;
                        restoredData[dstIdx] = segmentation.data[srcIdx];
                    }
                }
            }
        }
        
        return {
            data: restoredData,
            dimensions: originalDims,
            numClasses: 6
        };
    }

    applyFinePostprocessing(segmentation) {
        console.log('✨ 应用精细分割后处理...');
        
        // 这里可以实现精细的后处理，比如：
        // - 形态学操作（开运算、闭运算）
        // - 连通区域分析
        // - 基于解剖学知识的规则
        
        // 暂时直接返回原始结果
        // 可以根据需要添加具体的后处理逻辑
        
        return segmentation;
    }

    reset() {
        this.isInitialized = false;
        this.fineSession = null;
        this.ort = null;
    }
}