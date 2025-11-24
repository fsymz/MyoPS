// model-runner.js - 完整修复版本
class ModelRunner {
    constructor() {
        this.coarseSession = null;
        this.isInitialized = false;
        this.modelPath = './models/model_10300.onnx';
    }

    async loadModels() {
        if (this.isInitialized) {
            console.log('✅ 模型已加载，跳过重复加载');
            return;
        }

        console.log('🔧 正在加载ONNX模型...');
        
        if (typeof ort === 'undefined') {
            const errorMsg = 'ONNX Runtime Web 未加载。请检查：\n' +
                           '1. 网络连接是否正常\n' +
                           '2. 是否被浏览器扩展拦截\n' +
                           '3. 尝试刷新页面重新加载';
            console.error('❌ ' + errorMsg);
            throw new Error(errorMsg);
        }
        
        console.log('✅ ONNX Runtime 已加载');
        
        try {
            const backendsToTry = [
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
                    
                    this.coarseSession = await ort.InferenceSession.create(this.modelPath, options);
                    console.log(`🎉 模型加载成功! 使用后端: ${backends.join(', ')}`);
                    
                    // 安全地记录模型信息
                    this.logModelDetails();
                    
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
            console.error('❌ 模型加载失败:', error);
            
            let detailedError = error.message;
            if (error.message.includes('fetch failed')) {
                detailedError = `无法加载模型文件: ${this.modelPath}。请检查文件路径`;
            } else if (error.message.includes('Invalid model')) {
                detailedError = '模型文件格式无效';
            } else if (error.message.includes('no available backend found')) {
                detailedError = '无法找到可用的计算后端';
            }
            
            throw new Error(detailedError);
        }
    }

    logModelDetails() {
        console.log('🔍 模型基本信息:');
        console.log('- 输入名称:', this.coarseSession.inputNames);
        console.log('- 输出名称:', this.coarseSession.outputNames);
        
        // 安全地访问 inputs 和 outputs
        if (this.coarseSession.inputs && this.coarseSession.inputs.length > 0) {
            console.log('🔍 模型输入详细信息:');
            this.coarseSession.inputs.forEach((input, index) => {
                console.log(`  输入 ${index}:`, {
                    名称: input.name,
                    形状: input.dims,
                    类型: input.type
                });
            });
        } else {
            console.log('⚠️ 无法获取模型输入详细信息，inputs 属性为空');
        }
        
        if (this.coarseSession.outputs && this.coarseSession.outputs.length > 0) {
            console.log('🔍 模型输出详细信息:');
            this.coarseSession.outputs.forEach((output, index) => {
                console.log(`  输出 ${index}:`, {
                    名称: output.name,
                    形状: output.dims,
                    类型: output.type
                });
            });
        } else {
            console.log('⚠️ 无法获取模型输出详细信息，outputs 属性为空');
        }
    }

    async runCoarseInference(preprocessedData) {
        if (!this.isInitialized || !this.coarseSession) {
            throw new Error('模型未初始化');
        }
        
        const { inputTensor, originalShape, cropCoords } = preprocessedData;
        
        console.log(`🎯 模型输入形状: [${inputTensor.dims}]`);
        
        const inputName = this.coarseSession.inputNames[0];
        
        // 添加重试机制
        const maxRetries = 3;
        let lastError = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`🚀 开始模型推理 (尝试 ${attempt}/${maxRetries})...`);
                console.time(`推理时间-${attempt}`);
                
                // 安全的调试信息
                console.log('🔍 推理前检查:');
                console.log('- 输入名称:', inputName);
                console.log('- 输入形状:', inputTensor.dims);
                console.log('- 输入数据类型:', inputTensor.type);
                console.log('- 输入数据长度:', inputTensor.data.length);
                
                // 安全地获取模型输入信息
                let modelInputInfo = '无法获取';
                if (this.coarseSession.inputs && this.coarseSession.inputs.length > 0) {
                    const modelInput = this.coarseSession.inputs[0];
                    modelInputInfo = {
                        形状: modelInput.dims,
                        类型: modelInput.type
                    };
                }
                console.log('- 模型期望:', modelInputInfo);
                
                console.log('🎯 执行模型推理...');
                const output = await this.coarseSession.run({ [inputName]: inputTensor });
                
                console.timeEnd(`推理时间-${attempt}`);
                
                const outputName = this.coarseSession.outputNames[0];
                const outputData = output[outputName].data;
                const outputDims = output[outputName].dims;
                
                console.log(`✅ 推理成功! 输出形状: [${outputDims}]`);
                console.log(`📦 输出数据长度: ${outputData.length}`);
                
                return {
                    data: Array.from(outputData),
                    dims: outputDims,
                    originalShape: originalShape,
                    cropCoords: cropCoords
                };
                
            } catch (error) {
                lastError = error;
                console.error(`❌ 推理尝试 ${attempt} 失败:`, error.message);
                
                if (attempt < maxRetries) {
                    console.log(`🔄 等待重试... (${1000 * attempt}ms)`);
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }
        }
        
        // 所有重试都失败
        throw new Error(`推理失败: ${lastError.message}`);
    }

    // 获取模型信息（用于调试）
    getModelInfo() {
        if (!this.coarseSession) {
            return { error: '模型未加载' };
        }
        
        const inputs = [];
        const outputs = [];
        
        // 安全地获取输入信息
        if (this.coarseSession.inputs) {
            this.coarseSession.inputs.forEach(input => {
                inputs.push({
                    name: input.name,
                    dims: input.dims,
                    type: input.type
                });
            });
        }
        
        // 安全地获取输出信息
        if (this.coarseSession.outputs) {
            this.coarseSession.outputs.forEach(output => {
                outputs.push({
                    name: output.name,
                    dims: output.dims,
                    type: output.type
                });
            });
        }
        
        return {
            inputNames: this.coarseSession.inputNames,
            outputNames: this.coarseSession.outputNames,
            inputs: inputs,
            outputs: outputs,
            isInitialized: this.isInitialized
        };
    }

    reset() {
        this.coarseSession = null;
        this.isInitialized = false;
        console.log('🔄 模型运行器已重置');
    }
}