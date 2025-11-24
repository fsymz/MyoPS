// segmentation-pipeline.js - 完全按照Python代码实现
class SegmentationPipeline {
    constructor() {
        this.modelRunner = new ModelRunner();
        this.fineSegmenter = new FineSegmentation(); // 新增精细分割器
        this.isInitialized = false;
        
        // 与Python代码完全相同的参数
        this.CROP_MIN_HW = [78, 97];    // 高度和宽度的最小边界
        this.CROP_MAX_HW = [385, 401];  // 高度和宽度的最大边界
        this.PADDING_SIZE = [1, 16, 16]; // 深度填充到1的倍数，高度和宽度填充到16的倍数
        
        // 为了保持与app.js的兼容性
        this.fixedCropParams = {
            minH: 78,
            maxH: 385, 
            minW: 97,
            maxW: 401
        };
    }

    async initialize() {
        if (this.isInitialized) return;
        
        console.log('🔧 初始化分割管道...');
        try {
            await this.modelRunner.loadModels();
            // 不立即加载精细分割模型，在需要时加载
            this.isInitialized = true;
            console.log('✅ 分割管道初始化完成');
        } catch (error) {
            console.error('❌ 分割管道初始化失败:', error);
            throw error;
        }
    }

    async runCoarseStage(images, progressCallback) {
        console.log('🎯 开始运行粗分割阶段...');
        
        if (!this.isInitialized) await this.initialize();
        
        // 验证输入数据
        if (!images || !images.c0 || !images.de || !images.t2) {
            throw new Error('缺少必要的图像数据');
        }
        
        console.log('📦 输入图像信息:', {
            c0: images.c0.dimensions,
            de: images.de.dimensions, 
            t2: images.t2.dimensions
        });
        
        progressCallback(10, '应用预处理...');
        
        try {
            // 应用与Python代码完全相同的预处理
            const preprocessed = await this.applyPreprocessingIdenticalToPython(images, progressCallback);
            
            progressCallback(60, '运行模型推理...');
            
            console.log('🎯 开始模型推理...');
            const rawResult = await this.modelRunner.runCoarseInference(preprocessed);
            
            progressCallback(80, '后处理结果...');
            const finalResult = this.postprocessResultIdenticalToPython(rawResult, images.c0);
            
            progressCallback(100, '粗分割完成');
            return finalResult;
            
        } catch (error) {
            console.error('❌ 推理失败:', error);
            throw new Error(`分割失败: ${error.message}`);
        }
    }

    async applyPreprocessingIdenticalToPython(images, progressCallback) {
        console.log('🔧 开始预处理（与Python代码相同）...');
        
        const { c0, de, t2 } = images;
        
        progressCallback(15, '裁切图像...');
        
        // 1. 对三个模态应用相同的裁切（与Python代码相同）
        const c0Cropped = this.applyCropIdenticalToPython(c0.rawData, c0.dimensions);
        const deCropped = this.applyCropIdenticalToPython(de.rawData, de.dimensions);
        const t2Cropped = this.applyCropIdenticalToPython(t2.rawData, t2.dimensions);
        
        console.log('✂️ 裁切完成:', {
            c0: c0Cropped.croppedDims,
            de: deCropped.croppedDims,
            t2: t2Cropped.croppedDims
        });
        
        progressCallback(25, '归一化数据...');
        
        // 2. 应用病例级别的归一化（与Python代码完全相同）
        const c0Normalized = this.normalizeWithMeanStdIdenticalToPython(c0Cropped.croppedData);
        const deNormalized = this.normalizeWithMeanStdIdenticalToPython(deCropped.croppedData);
        const t2Normalized = this.normalizeWithMeanStdIdenticalToPython(t2Cropped.croppedData);
        
        progressCallback(35, '构建3D体积...');
        
        // 3. 合并三个模态为3通道体积 [depth, height, width, 3]（与Python代码相同）
        const volume3D = this.mergeModalitiesIdenticalToPython(
            c0Normalized, 
            deNormalized, 
            t2Normalized, 
            c0Cropped.croppedDims
        );
        
        progressCallback(45, '准备模型输入...');
        
        // 4. 调整维度顺序为 [batch, channels, depth, height, width]（与Python代码相同）
        const inputData = this.prepareModelInputIdenticalToPython(volume3D);
        
        // 5. 应用填充（与Python代码相同）
        const paddedResult = this.applyPaddingIdenticalToPython(inputData);
        
        // 6. 创建ONNX Tensor
        const inputTensor = new ort.Tensor('float32', paddedResult.data, paddedResult.dims);
        
        console.log('✅ 预处理完成（与Python代码相同）');
        
        // 调试预处理步骤
        this.debugPreprocessingSteps(images, {
            inputTensor: inputTensor,
            originalShape: paddedResult.originalShape,
            cropCoords: c0Cropped.cropCoords,
            originalImage: c0
        });
        
        return {
            inputTensor: inputTensor,
            originalShape: paddedResult.originalShape,
            cropCoords: c0Cropped.cropCoords,
            originalImage: c0
        };
    }

    applyCropIdenticalToPython(data, dimensions) {
        const [width, height, depth] = dimensions;
        
        // 修正：使用与Python代码完全相同的裁切参数
        // 从Python输出看，裁切坐标是: (78, 335, 97, 341)
        const minH = 78;   // 高度起始
        const maxH = 335;  // 高度结束  
        const minW = 97;   // 宽度起始
        const maxW = 341;  // 宽度结束
        
        // 计算裁切后的尺寸
        const croppedHeight = maxH - minH;  // 335 - 78 = 257
        const croppedWidth = maxW - minW;   // 341 - 97 = 244
        const croppedDepth = depth;         // 深度保持不变
        
        console.log(`✂️ 裁切详情: 原始${width}x${height}x${depth} -> ${croppedWidth}x${croppedHeight}x${croppedDepth}`);
        console.log(`  裁切范围: 高度[${minH}-${maxH}], 宽度[${minW}-${maxW}]`);
        
        // 验证裁切范围是否在图像范围内
        if (minH < 0 || maxH > height || minW < 0 || maxW > width) {
            console.warn(`⚠️ 裁切参数超出图像范围: 图像${height}x${width}, 裁切高度[${minH}-${maxH}], 宽度[${minW}-${maxW}]`);
            
            // 调整到有效范围
            const adjustedMinH = Math.max(0, minH);
            const adjustedMaxH = Math.min(height, maxH);
            const adjustedMinW = Math.max(0, minW);
            const adjustedMaxW = Math.min(width, maxW);
            
            console.log(`🔄 调整裁切范围: 高度[${adjustedMinH}-${adjustedMaxH}], 宽度[${adjustedMinW}-${adjustedMaxW}]`);
            
            return this.applyCropWithAdjustedRange(data, dimensions, adjustedMinH, adjustedMaxH, adjustedMinW, adjustedMaxW);
        }
        
        const croppedData = new Float32Array(croppedDepth * croppedHeight * croppedWidth);
        
        // 执行裁切 - 修正索引计算
        for (let z = 0; z < croppedDepth; z++) {
            for (let y = 0; y < croppedHeight; y++) {
                for (let x = 0; x < croppedWidth; x++) {
                    const origY = y + minH;
                    const origX = x + minW;
                    
                    // 修正索引计算：原始数据是 [width, height, depth] 顺序
                    // 原始索引: z * (height * width) + origY * width + origX
                    const srcIdx = z * (height * width) + origY * width + origX;
                    
                    // 目标索引: z * (croppedHeight * croppedWidth) + y * croppedWidth + x
                    const dstIdx = z * (croppedHeight * croppedWidth) + y * croppedWidth + x;
                    
                    if (srcIdx >= 0 && srcIdx < data.length) {
                        croppedData[dstIdx] = data[srcIdx];
                    } else {
                        console.warn(`索引越界: srcIdx=${srcIdx}, data.length=${data.length}`);
                    }
                }
            }
        }
        
        return {
            croppedData: croppedData,
            croppedDims: [croppedWidth, croppedHeight, croppedDepth], // 保持 [width, height, depth] 顺序
            cropCoords: { minH, maxH, minW, maxW }
        };
    }

    // 添加辅助方法处理调整后的裁切范围
    applyCropWithAdjustedRange(data, dimensions, minH, maxH, minW, maxW) {
        const [width, height, depth] = dimensions;
        const croppedHeight = maxH - minH;
        const croppedWidth = maxW - minW;
        const croppedDepth = depth;
        
        console.log(`🔄 应用调整后裁切: ${croppedWidth}x${croppedHeight}x${croppedDepth}`);
        
        const croppedData = new Float32Array(croppedDepth * croppedHeight * croppedWidth);
        
        for (let z = 0; z < croppedDepth; z++) {
            for (let y = 0; y < croppedHeight; y++) {
                for (let x = 0; x < croppedWidth; x++) {
                    const origY = y + minH;
                    const origX = x + minW;
                    
                    const srcIdx = z * (height * width) + origY * width + origX;
                    const dstIdx = z * (croppedHeight * croppedWidth) + y * croppedWidth + x;
                    
                    if (srcIdx >= 0 && srcIdx < data.length) {
                        croppedData[dstIdx] = data[srcIdx];
                    }
                }
            }
        }
        
        return {
            croppedData: croppedData,
            croppedDims: [croppedWidth, croppedHeight, croppedDepth],
            cropCoords: { minH, maxH, minW, maxW }
        };
    }

    normalizeWithMeanStdIdenticalToPython(data) {
        // 计算均值和标准差（病例级别归一化，与Python代码相同）
        const mean = this.calculateMean(data);
        const std = this.calculateStd(data, mean);
        
        console.log(`📊 归一化 - 均值: ${mean.toFixed(4)}, 标准差: ${std.toFixed(4)}`);
        
        // 应用归一化（与Python代码相同： (data - mean) / (std + 1e-8) ）
        const normalized = new Float32Array(data.length);
        for (let i = 0; i < data.length; i++) {
            normalized[i] = (data[i] - mean) / (std + 1e-8);
        }
        
        return normalized;
    }

    calculateMean(data) {
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i];
        }
        return sum / data.length;
    }

    calculateStd(data, mean) {
        let sumSq = 0;
        for (let i = 0; i < data.length; i++) {
            const diff = data[i] - mean;
            sumSq += diff * diff;
        }
        return Math.sqrt(sumSq / data.length);
    }

    mergeModalitiesIdenticalToPython(c0Data, deData, t2Data, dimensions) {
        const [width, height, depth] = dimensions;
        const totalVoxels = depth * height * width;
        
        // 创建 [depth, height, width, 3] 形状的体积（与Python代码相同）
        const volume = new Float32Array(totalVoxels * 3);
        
        for (let z = 0; z < depth; z++) {
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const voxelIndex = (z * height + y) * width + x;
                    
                    // 设置三个通道（与Python代码相同顺序）
                    volume[voxelIndex * 3] = c0Data[voxelIndex];     // 通道0: C0
                    volume[voxelIndex * 3 + 1] = deData[voxelIndex]; // 通道1: DE  
                    volume[voxelIndex * 3 + 2] = t2Data[voxelIndex]; // 通道2: T2
                }
            }
        }
        
        return {
            data: volume,
            shape: [depth, height, width, 3]  // 与Python代码相同
        };
    }

    prepareModelInputIdenticalToPython(volume3D) {
        const [depth, height, width, channels] = volume3D.shape;
        
        // 调整维度顺序: [depth, height, width, 3] -> [3, depth, height, width]（与Python代码相同）
        const transposed = new Float32Array(volume3D.data.length);
        
        let idx = 0;
        for (let c = 0; c < channels; c++) {
            for (let z = 0; z < depth; z++) {
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const srcIdx = ((z * height + y) * width + x) * channels + c;
                        transposed[idx++] = volume3D.data[srcIdx];
                    }
                }
            }
        }
        
        // 添加batch维度: [1, 3, depth, height, width]（与Python代码相同）
        return {
            data: transposed,
            dims: [1, 3, depth, height, width],
            originalShape: [depth, height, width]
        };
    }

    applyPaddingIdenticalToPython(inputData) {
        const [batch, channels, depth, height, width] = inputData.dims;
        
        // 修正：使用与Python代码完全相同的填充策略
        // Python端：深度填充到1的倍数，高度和宽度填充到16的倍数
        const padDepth = 1;   // 深度填充到1的倍数
        const padHeight = 16; // 高度填充到16的倍数  
        const padWidth = 16;  // 宽度填充到16的倍数
        
        // 计算填充后的尺寸（向上取整到指定倍数）
        const paddedDepth = Math.ceil(depth / padDepth) * padDepth;
        const paddedHeight = Math.ceil(height / padHeight) * padHeight;
        const paddedWidth = Math.ceil(width / padWidth) * padWidth;
        
        console.log(`📦 应用填充: ${depth}x${height}x${width} -> ${paddedDepth}x${paddedHeight}x${paddedWidth}`);
        
        // 如果不需要填充，直接返回
        if (paddedDepth === depth && paddedHeight === height && paddedWidth === width) {
            return {
                data: inputData.data,
                dims: inputData.dims,
                originalShape: inputData.originalShape
            };
        }
        
        // 创建填充后的数组（用0填充）
        const totalSize = batch * channels * paddedDepth * paddedHeight * paddedWidth;
        const paddedData = new Float32Array(totalSize);
        paddedData.fill(0);
        
        // 将原始数据复制到填充数组的左上角
        for (let b = 0; b < batch; b++) {
            for (let c = 0; c < channels; c++) {
                for (let z = 0; z < depth; z++) {
                    for (let y = 0; y < height; y++) {
                        for (let x = 0; x < width; x++) {
                            const srcIdx = (((b * channels + c) * depth + z) * height + y) * width + x;
                            const dstIdx = (((b * channels + c) * paddedDepth + z) * paddedHeight + y) * paddedWidth + x;
                            paddedData[dstIdx] = inputData.data[srcIdx];
                        }
                    }
                }
            }
        }
        
        return {
            data: paddedData,
            dims: [batch, channels, paddedDepth, paddedHeight, paddedWidth],
            originalShape: inputData.originalShape
        };
    }

    debugPreprocessingSteps(images, preprocessed) {
        console.log('🔍 预处理步骤调试:');
        console.log('📊 原始图像维度:');
        console.log('  - C0:', images.c0.dimensions);
        console.log('  - DE:', images.de.dimensions);
        console.log('  - T2:', images.t2.dimensions);
        
        console.log('✂️ 裁切后维度:');
        const c0Cropped = this.applyCropIdenticalToPython(images.c0.rawData, images.c0.dimensions);
        console.log('  - C0裁切:', c0Cropped.croppedDims);
        
        console.log('📦 填充后维度:');
        console.log('  - 最终输入:', preprocessed.inputTensor.dims);
        
        // 检查数值范围
        const inputData = preprocessed.inputTensor.data;
        let min = Infinity, max = -Infinity;
        for (let i = 0; i < Math.min(1000, inputData.length); i++) {
            if (inputData[i] < min) min = inputData[i];
            if (inputData[i] > max) max = inputData[i];
        }
        console.log(`📊 输入数据范围: [${min.toFixed(4)}, ${max.toFixed(4)}]`);
        
        console.log('📋 预处理结果汇总:');
        console.log('  - 原始尺寸:', images.c0.dimensions);
        console.log('  - 裁切后尺寸:', c0Cropped.croppedDims);
        console.log('  - 填充后尺寸:', preprocessed.inputTensor.dims);
        console.log('  - 裁切坐标:', c0Cropped.cropCoords);
    }

    postprocessResultIdenticalToPython(result, originalImage) {
        const { data, dims, originalShape, cropCoords } = result;
        
        console.log('🎯 后处理输入:', {
            模型输出形状: dims,
            原始形状: originalShape
        });
        
        // 1. 移除填充（与Python代码相同）
        const unpaddedData = this.removePaddingIdenticalToPython(data, dims, originalShape);
        
        // 2. 取argmax得到分割结果（与Python代码相同）
        const segmentation = this.convertToSegmentationMaskIdenticalToPython(unpaddedData, originalShape);
        
        // 3. 映射回原始空间（与Python代码相同）
        const restoredSegmentation = this.restoreToOriginalSpaceIdenticalToPython(segmentation, originalImage, cropCoords);
        
        // 4. 应用最大连通区域分析（新增后处理）
        const finalResult = this.applyConnectedComponentAnalysis(restoredSegmentation);
        
        return finalResult;
    }

    applyConnectedComponentAnalysis(segmentationData) {
        console.log('🔍 应用最大连通区域分析...');
        
        const { data, dimensions } = segmentationData;
        const [width, height, depth] = dimensions;
        const totalVoxels = width * height * depth;
        
        // 创建处理后的数据
        const processedData = new Uint8Array(totalVoxels);
        
        // 对每个类别分别应用最大连通区域分析
        for (let classId = 1; classId <= 3; classId++) {
            console.log(`  处理类别 ${classId}...`);
            
            // 创建当前类别的二值掩码
            const binaryMask = new Uint8Array(totalVoxels);
            for (let i = 0; i < totalVoxels; i++) {
                binaryMask[i] = data[i] === classId ? 1 : 0;
            }
            
            // 应用最大连通区域分析
            const largestComponent = this.getLargestConnectedComponent(binaryMask, dimensions);
            
            // 合并结果
            for (let i = 0; i < totalVoxels; i++) {
                if (largestComponent[i] === 1) {
                    processedData[i] = classId;
                } else if (processedData[i] === 0) {
                    // 保留其他类别的结果
                    processedData[i] = data[i];
                }
            }
        }
        
        // 统计处理前后的类别分布
        const originalCounts = [0, 0, 0, 0];
        const processedCounts = [0, 0, 0, 0];
        
        for (let i = 0; i < totalVoxels; i++) {
            if (data[i] < originalCounts.length) originalCounts[data[i]]++;
            if (processedData[i] < processedCounts.length) processedCounts[processedData[i]]++;
        }
        
        console.log('📊 后处理统计:');
        console.log('  处理前:', originalCounts.map((count, i) => `类别${i}: ${count}`).join(', '));
        console.log('  处理后:', processedCounts.map((count, i) => `类别${i}: ${count}`).join(', '));
        
        return {
            data: processedData,
            dimensions: dimensions,
            numClasses: 4
        };
    }

    getLargestConnectedComponent(binaryMask, dimensions) {
        const [width, height, depth] = dimensions;
        const totalVoxels = width * height * depth;
        
        // 简单的连通区域分析实现
        const visited = new Uint8Array(totalVoxels);
        const components = [];
        
        // 6-邻域连通性
        const neighbors = [
            [1, 0, 0], [-1, 0, 0],  // x方向
            [0, 1, 0], [0, -1, 0],  // y方向  
            [0, 0, 1], [0, 0, -1]   // z方向
        ];
        
        for (let i = 0; i < totalVoxels; i++) {
            if (binaryMask[i] === 1 && visited[i] === 0) {
                const component = [];
                const stack = [i];
                visited[i] = 1;
                
                while (stack.length > 0) {
                    const current = stack.pop();
                    component.push(current);
                    
                    // 计算当前体素的3D坐标
                    const z = Math.floor(current / (width * height));
                    const y = Math.floor((current % (width * height)) / width);
                    const x = current % width;
                    
                    // 检查6-邻域
                    for (const [dx, dy, dz] of neighbors) {
                        const nx = x + dx;
                        const ny = y + dy;
                        const nz = z + dz;
                        
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height && nz >= 0 && nz < depth) {
                            const neighborIdx = nz * (width * height) + ny * width + nx;
                            
                            if (binaryMask[neighborIdx] === 1 && visited[neighborIdx] === 0) {
                                visited[neighborIdx] = 1;
                                stack.push(neighborIdx);
                            }
                        }
                    }
                }
                
                components.push(component);
            }
        }
        
        // 找到最大的连通区域
        if (components.length === 0) {
            return new Uint8Array(totalVoxels); // 返回空掩码
        }
        
        let largestComponent = components[0];
        for (const component of components) {
            if (component.length > largestComponent.length) {
                largestComponent = component;
            }
        }
        
        // 创建结果掩码
        const result = new Uint8Array(totalVoxels);
        for (const idx of largestComponent) {
            result[idx] = 1;
        }
        
        console.log(`  找到 ${components.length} 个连通区域，最大区域包含 ${largestComponent.length} 个体素`);
        
        return result;
    }

    removePaddingIdenticalToPython(data, paddedDims, originalShape) {
        const [batch, classes, paddedDepth, paddedHeight, paddedWidth] = paddedDims;
        const [origDepth, origHeight, origWidth] = originalShape;
        
        // 如果不需要移除填充，直接返回
        if (paddedDepth === origDepth && paddedHeight === origHeight && paddedWidth === origWidth) {
            return data;
        }
        
        console.log(`✂️ 移除填充: ${paddedDepth}x${paddedHeight}x${paddedWidth} -> ${origDepth}x${origHeight}x${origWidth}`);
        
        const totalVoxels = batch * classes * origDepth * origHeight * origWidth;
        const unpaddedData = new Float32Array(totalVoxels);
        
        for (let b = 0; b < batch; b++) {
            for (let c = 0; c < classes; c++) {
                for (let z = 0; z < origDepth; z++) {
                    for (let y = 0; y < origHeight; y++) {
                        for (let x = 0; x < origWidth; x++) {
                            const srcIdx = (((b * classes + c) * paddedDepth + z) * paddedHeight + y) * paddedWidth + x;
                            const dstIdx = (((b * classes + c) * origDepth + z) * origHeight + y) * origWidth + x;
                            unpaddedData[dstIdx] = data[srcIdx];
                        }
                    }
                }
            }
        }
        
        return unpaddedData;
    }

    convertToSegmentationMaskIdenticalToPython(probabilities, dimensions) {
        const [depth, height, width] = dimensions;
        const totalVoxels = depth * height * width;
        const numClasses = 4; // 4个类别
        
        const segmentation = new Uint8Array(totalVoxels);
        
        console.time('转换为分割掩码');
        
        // 对每个体素取argmax（与Python代码相同）
        for (let i = 0; i < totalVoxels; i++) {
            let maxProb = -Infinity;
            let bestClass = 0;
            
            for (let c = 0; c < numClasses; c++) {
                const probIndex = c * totalVoxels + i;
                if (probIndex < probabilities.length) {
                    const prob = probabilities[probIndex];
                    if (prob > maxProb) {
                        maxProb = prob;
                        bestClass = c;
                    }
                }
            }
            
            segmentation[i] = bestClass;
        }
        
        console.timeEnd('转换为分割掩码');
        
        // 统计类别分布
        const classCounts = [0, 0, 0, 0];
        for (let i = 0; i < segmentation.length; i++) {
            if (segmentation[i] < classCounts.length) {
                classCounts[segmentation[i]]++;
            }
        }
        
        console.log('📊 分割结果统计:', classCounts.map((count, i) => `类别${i}: ${count}像素`).join(', '));
        
        return {
            data: segmentation,
            dimensions: [width, height, depth], // 返回到原始维度顺序
            numClasses: 4
        };
    }

    restoreToOriginalSpaceIdenticalToPython(segmentationData, originalImage, cropCoords) {
        // 这里实现将裁切后的分割结果映射回原始图像空间
        // 与Python代码中的 restore_to_original_space 函数相同
        
        const { minH, maxH, minW, maxW } = cropCoords;
        const [croppedWidth, croppedHeight, croppedDepth] = segmentationData.dimensions;
        const [origWidth, origHeight, origDepth] = originalImage.dimensions;
        
        console.log(`🔄 映射回原始空间: ${croppedWidth}x${croppedHeight}x${croppedDepth} -> ${origWidth}x${origHeight}x${origDepth}`);
        
        // 创建与原始图像相同大小的零数组
        const restoredData = new Uint8Array(origWidth * origHeight * origDepth);
        restoredData.fill(0);
        
        // 将裁切后的分割结果放回正确的位置
        for (let z = 0; z < croppedDepth; z++) {
            for (let y = 0; y < croppedHeight; y++) {
                for (let x = 0; x < croppedWidth; x++) {
                    const srcIdx = (z * croppedHeight + y) * croppedWidth + x;
                    const dstY = y + minH;
                    const dstX = x + minW;
                    const dstIdx = (z * origHeight + dstY) * origWidth + dstX;
                    
                    if (dstY < origHeight && dstX < origWidth && dstIdx < restoredData.length) {
                        restoredData[dstIdx] = segmentationData.data[srcIdx];
                    }
                }
            }
        }
        
        return {
            data: restoredData,
            dimensions: [origWidth, origHeight, origDepth],
            numClasses: 4,
            voxelSize: originalImage.voxelSize // 确保使用C0图像的体素间距
        };
    }

    async runFineStage(images, coarseResult, progressCallback) {
        console.log('🎯 开始精细分割阶段...');
        
        try {
            progressCallback(10, '初始化精细分割...');
            
            // 确保粗分割结果使用C0图像的体素间距
            const coarseResultWithC0Spacing = {
                ...coarseResult,
                voxelSize: images.c0.voxelSize // 使用C0图像的体素间距
            };
            
            console.log('📏 设置粗分割结果体素间距与C0一致:', images.c0.voxelSize);
            
            // 运行精细分割
            const fineResult = await this.fineSegmenter.runFineSegmentation(
                images, 
                coarseResultWithC0Spacing, // 传递带有正确间距的粗分割结果
                (progress, message) => {
                    // 将精细分割的进度映射到整体进度 (10% - 90%)
                    const overallProgress = 10 + progress * 0.8;
                    progressCallback(overallProgress, message);
                }
            );
            
            progressCallback(95, '完成精细分割...');
            
            console.log('✅ 精细分割完成');
            return fineResult;
            
        } catch (error) {
            console.error('❌ 精细分割失败:', error);
            throw error; // 失败就是失败，不切换用粗分割
        }
    }

    reset() {
        this.isInitialized = false;
        this.modelRunner.reset();
        this.fineSegmenter.reset();
    }
}