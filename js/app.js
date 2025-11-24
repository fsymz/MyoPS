// app.js - 主应用逻辑控制器 - 包含精细分割兼容性检查
class MyoPSApp {
    constructor() {
        this.fileUploadManager = new FileUploadManager();
        this.pipeline = new SegmentationPipeline();
        this.visualizer = new MultiPlanarVisualization();
        this.threeDVisualizer = new ThreeDVisualization();
        
        this.originalImages = null;
        this.coarseResult = null;
        this.finalResult = null;
        
        // 调试模式
        this.debugMode = true;
        
        this.initialize();
    }

    initialize() {
        console.log('🔧 初始化MyoPS应用...');
        
        // 预检查 ONNX Runtime
        if (typeof ort === 'undefined') {
            this.handleONNXNotLoaded();
            return;
        }
        
        try {
            this.setupEventListeners();
            this.checkGPUAvailability();
            this.updateStatus('准备就绪，请上传C0、DE、T2序列文件', null, 'info');
            
            if (this.debugMode) {
                console.log('✅ 应用初始化完成');
            }
        } catch (error) {
            console.error('❌ 应用初始化失败:', error);
            this.handleError('应用初始化失败', error);
        }
    }

    setupEventListeners() {
        console.log('🔧 设置事件监听器...');
        
        try {
            // 文件上传事件
            this.setupFileUploadListeners();
            
            // 控制按钮事件
            this.setupControlListeners();
            
            // 可视化控制事件
            this.setupVisualizationListeners();
            
            console.log('✅ 所有事件监听器设置完成');
        } catch (error) {
            console.error('❌ 设置事件监听器失败:', error);
            this.handleError('设置界面控件失败', error);
        }
    }

    setupFileUploadListeners() {
        ['c0', 'de', 't2'].forEach(modality => {
            const input = document.getElementById(`${modality}Upload`);
            const label = input.previousElementSibling;
            
            if (!input || !label) {
                console.error(`❌ 找不到 ${modality} 上传元素`);
                return;
            }
            
            // 点击label触发文件选择
            label.addEventListener('click', (e) => {
                e.preventDefault();
                input.click();
            });
            
            // 文件选择事件
            input.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                await this.handleFileUpload(modality, file, input);
            });
        });

        // 上传区域拖拽事件
        this.setupDragAndDrop();
    }

    async handleFileUpload(modality, file, inputElement) {
        try {
            this.updateFileStatus(modality, '加载中...');
            await this.fileUploadManager.handleFileUpload(modality, file);
            this.updateFileStatus(modality, '已加载');
            
            // 显示文件信息
            if (this.fileUploadManager.isAllFilesLoaded()) {
                this.displayFileInfo();
            }
            
            this.checkReadyForSegmentation();
            
            if (this.debugMode) {
                console.log(`✅ ${modality.toUpperCase()} 文件加载成功`);
            }
        } catch (error) {
            this.handleError(`${modality.toUpperCase()}文件加载失败`, error);
            this.updateFileStatus(modality, '加载失败');
            inputElement.value = '';
        }
    }

    setupDragAndDrop() {
        const uploadArea = document.getElementById('uploadArea');
        
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            console.log('文件拖拽功能暂未实现');
        });
    }

    setupControlListeners() {
        // 粗分割按钮
        const processBtn = document.getElementById('processBtn');
        if (processBtn) {
            processBtn.addEventListener('click', () => {
                console.log('🎯 粗分割按钮被点击');
                this.startCoarseSegmentation();
            });
        }

        // 精细分割按钮
        const fineSegmentBtn = document.getElementById('fineSegmentBtn');
        if (fineSegmentBtn) {
            fineSegmentBtn.addEventListener('click', () => {
                console.log('🎯 精细分割按钮被点击');
                this.startFineSegmentation();
            });
        }

        // 跳过精细分割按钮
        const skipFineBtn = document.getElementById('skipFineBtn');
        if (skipFineBtn) {
            skipFineBtn.addEventListener('click', () => {
                console.log('🎯 跳过精细分割按钮被点击');
                this.skipFineSegmentation();
            });
        }

        // 下载按钮
        const downloadBtn = document.getElementById('downloadBtn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                console.log('🎯 下载按钮被点击');
                this.downloadResults();
            });
        }

        // 重置按钮
        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                console.log('🎯 重置按钮被点击');
                this.reset();
            });
        }

        // 透明度滑块
        const opacitySlider = document.getElementById('opacitySlider');
        if (opacitySlider) {
            opacitySlider.addEventListener('input', (e) => {
                const opacity = parseFloat(e.target.value) / 100;
                const opacityValue = document.getElementById('opacityValue');
                if (opacityValue) {
                    opacityValue.textContent = `${e.target.value}%`;
                }
                this.visualizer.setSegmentationOpacity(opacity);
            });
        }

        // 新增：深度拉伸控制
        const depthStretchSlider = document.getElementById('depthStretchSlider');
        if (depthStretchSlider) {
            depthStretchSlider.addEventListener('input', (e) => {
                const stretch = parseFloat(e.target.value);
                const stretchValue = document.getElementById('depthStretchValue');
                if (stretchValue) {
                    stretchValue.textContent = `${stretch.toFixed(1)}x`;
                }
                if (this.threeDVisualizer) {
                    this.threeDVisualizer.setDepthStretch(stretch);
                }
            });
        }
    }

    setupVisualizationListeners() {
        // 切片导航按钮
        ['axial', 'coronal', 'sagittal'].forEach(plane => {
            const prevBtn = document.getElementById(`${plane}Prev`);
            const nextBtn = document.getElementById(`${plane}Next`);
            
            if (prevBtn) {
                prevBtn.addEventListener('click', () => {
                    this.visualizer.navigateSlice(plane, -1);
                });
            }
            
            if (nextBtn) {
                nextBtn.addEventListener('click', () => {
                    this.visualizer.navigateSlice(plane, 1);
                });
            }
        });

        // 3D控制（简单实现）
        const rotate3D = document.getElementById('rotate3D');
        const reset3D = document.getElementById('reset3D');
        
        if (rotate3D) {
            rotate3D.addEventListener('click', () => {
                this.updateStatus('3D旋转功能开发中', null, 'info');
            });
        }
        
        if (reset3D) {
            reset3D.addEventListener('click', () => {
                this.updateStatus('3D重置功能开发中', null, 'info');
            });
        }
    }

    async startCoarseSegmentation() {
        console.log('🚀 开始粗分割流程...');
        
        try {
            // 禁用按钮防止重复点击
            document.getElementById('processBtn').disabled = true;
            this.showProgress(true);
            
            this.updateStatus('🔄 正在初始化分割管道...', 5);
            
            // 检查文件是否已加载
            if (!this.fileUploadManager.isAllFilesLoaded()) {
                throw new Error('请先上传所有必要的文件（C0、DE、T2）');
            }
            
            // 加载图像数据
            this.originalImages = this.fileUploadManager.getLoadedImages();
            
            // 检查图像维度兼容性
            const c0Dims = this.originalImages.c0.dimensions;
            console.log('🔍 原始图像维度:', c0Dims);
            
            // 初始化管道
            this.updateStatus('🔄 正在加载模型...', 10);
            await this.pipeline.initialize();
            
            // 运行粗分割
            this.updateStatus('🎯 正在应用预处理...', 15);
            
            this.coarseResult = await this.pipeline.runCoarseStage(
                this.originalImages,
                (progress, message) => {
                    console.log(`📊 进度: ${progress}% - ${message}`);
                    this.updateStatus(message, progress);
                }
            );
            
            // 显示粗分割结果
            this.updateStatus('🎨 正在渲染可视化...', 85);
            
            if (this.coarseResult) {
                console.log('✅ 粗分割完成，结果维度:', this.coarseResult.dimensions);
                
                // 确保粗分割结果包含体素间距信息
                if (!this.coarseResult.voxelSize && this.originalImages.c0.voxelSize) {
                    this.coarseResult.voxelSize = this.originalImages.c0.voxelSize;
                    console.log('📏 为粗分割结果设置体素间距:', this.coarseResult.voxelSize);
                }
                
                // 设置图像数据和分割结果
                this.visualizer.setImageData(this.originalImages.c0);
                this.visualizer.setSegmentationData(this.coarseResult);
                
                // 设置3D可视化数据时传递体素间距
                this.threeDVisualizer.setSegmentationData(
                    this.coarseResult, 
                    this.coarseResult.voxelSize || this.originalImages.c0.voxelSize
                );
                
                this.updateStatus('✅ 粗分割完成！请选择是否继续精细分割', 100);
                this.showSegmentationChoice();
            } else {
                throw new Error('粗分割没有返回结果');
            }
            
        } catch (error) {
            console.error('❌ 粗分割失败:', error);
            this.handleError('❌ 粗分割失败', error);
            
            // 重新启用按钮
            const processBtn = document.getElementById('processBtn');
            if (processBtn) {
                processBtn.disabled = false;
            }
        } finally {
            this.showProgress(false);
        }
    }

    showSegmentationChoice() {
        const progressContainer = document.getElementById('progressContainer');
        const segmentationChoice = document.getElementById('segmentationChoice');
        
        if (progressContainer) {
            progressContainer.style.display = 'none';
        }
        
        if (segmentationChoice) {
            segmentationChoice.classList.add('visible');
        }
    }

    async startFineSegmentation() {
        console.log('🚀 开始精细分割流程...');
        
        try {
            const segmentationChoice = document.getElementById('segmentationChoice');
            if (segmentationChoice) {
                segmentationChoice.classList.remove('visible');
            }
            
            this.showProgress(true);
            this.updateStatus('🔄 正在准备精细分割...', 10);
            
            // 检查粗分割结果
            if (!this.coarseResult) {
                throw new Error('没有可用的粗分割结果');
            }
            
            // 检查精细分割模块的ONNX Runtime兼容性
            this.updateStatus('🔧 检查精细分割环境...', 15);
            await this.checkFineSegmentationCompatibility();
            
            // 执行精细分割管道
            this.finalResult = await this.pipeline.runFineStage(
                this.originalImages,
                this.coarseResult,
                (progress, message) => {
                    console.log(`📊 精细分割进度: ${progress}% - ${message}`);
                    this.updateStatus(message, progress);
                }
            ).catch(error => {
                console.error('❌ 精细分割管道错误:', error);
                throw new Error(`精细分割失败: ${error.message}`);
            });
            
            // 更新可视化 - 修复：传递体素间距
            this.visualizer.setSegmentationData(this.finalResult);
            this.threeDVisualizer.setSegmentationData(
                this.finalResult, 
                this.finalResult.voxelSize || this.originalImages.c0.voxelSize
            );
            
            this.updateStatus('✅ 精细分割完成！', 100);
            
            // 启用下载
            const downloadBtn = document.getElementById('downloadBtn');
            if (downloadBtn) {
                downloadBtn.disabled = false;
            }
            
            if (this.debugMode) {
                console.log('✅ 精细分割流程完成');
            }
            
        } catch (error) {
            console.error('❌ 精细分割失败:', error);
            this.handleError('❌ 精细分割失败', error);
            
            // 提供回退选项
            this.showFallbackOption();
        } finally {
            this.showProgress(false);
        }
    }

    // 添加兼容性检查方法
    async checkFineSegmentationCompatibility() {
        try {
            this.updateStatus('🔍 检查精细分割环境兼容性...', 20);
            
            // 测试精细分割模块的初始化
            if (!this.pipeline.fineSegmenter) {
                throw new Error('精细分割模块未正确初始化');
            }
            
            await this.pipeline.fineSegmenter.initialize();
            console.log('✅ 精细分割环境检查通过');
            
            this.updateStatus('✅ 精细分割环境检查通过', 25);
            return true;
        } catch (error) {
            console.error('❌ 精细分割环境检查失败:', error);
            
            let userMessage = '精细分割环境初始化失败: ';
            
            if (error.message.includes('ONNX Runtime')) {
                userMessage += 'AI引擎兼容性问题，建议使用粗分割结果';
            } else if (error.message.includes('模型文件')) {
                userMessage += '精细分割模型文件问题';
            } else if (error.message.includes('加载失败')) {
                userMessage += 'AI库加载失败，请刷新页面重试';
            } else {
                userMessage += error.message;
            }
            
            this.updateStatus('❌ 精细分割环境检查失败', 25, 'error');
            throw new Error(userMessage);
        }
    }

    showFallbackOption() {
        const segmentationChoice = document.getElementById('segmentationChoice');
        if (segmentationChoice) {
            segmentationChoice.innerHTML = `
                <button class="choice-btn primary" id="retryFineBtn">🔄 重试精细分割</button>
                <button class="choice-btn secondary" id="useCoarseBtn">⏭️ 使用粗分割结果</button>
            `;
            segmentationChoice.classList.add('visible');
            
            // 绑定新按钮事件
            document.getElementById('retryFineBtn').addEventListener('click', () => {
                this.startFineSegmentation();
            });
            document.getElementById('useCoarseBtn').addEventListener('click', () => {
                this.skipFineSegmentation();
            });
        }
    }

    skipFineSegmentation() {
        if (this.debugMode) console.log('⏭️ 用户跳过精细分割');
        
        this.finalResult = this.coarseResult;
        
        const segmentationChoice = document.getElementById('segmentationChoice');
        if (segmentationChoice) {
            segmentationChoice.classList.remove('visible');
        }
        
        const downloadBtn = document.getElementById('downloadBtn');
        if (downloadBtn) {
            downloadBtn.disabled = false;
        }
        
        this.updateStatus('ℹ️ 已跳过精细分割，使用粗分割结果');
    }

    downloadResults() {
        if (!this.finalResult) {
            this.handleError('下载失败', new Error('没有可用的分割结果'));
            return;
        }
        
        if (!this.originalImages || !this.originalImages.c0) {
            this.handleError('下载失败', new Error('没有可用的原始图像数据'));
            return;
        }
        
        try {
            this.updateStatus('📥 正在准备下载文件...', 50);
            
            const downloader = new ResultDownloader();
            downloader.downloadNifti(
                this.finalResult, 
                this.originalImages.c0.header,
                'myops_segmentation.nii.gz'
            );
            
            this.updateStatus('✅ 结果下载完成！', 100);
            
            if (this.debugMode) console.log('✅ 文件下载已触发');
            
        } catch (error) {
            this.handleError('❌ 下载失败', error);
        }
    }

    showProgress(show) {
        const progressContainer = document.getElementById('progressContainer');
        if (progressContainer) {
            progressContainer.style.display = show ? 'block' : 'none';
        }
        
        if (!show) {
            const progressBar = document.getElementById('progress');
            if (progressBar) {
                progressBar.style.width = '0%';
            }
        }
    }

    updateStatus(message, progress = null, type = 'info') {
        const statusEl = document.getElementById('status');
        if (!statusEl) {
            console.warn('找不到状态元素');
            return;
        }
        
        statusEl.textContent = message;
        statusEl.className = `status ${type}`;
        
        if (progress !== null) {
            const progressBar = document.getElementById('progress');
            if (progressBar) {
                progressBar.style.width = `${progress}%`;
            }
        }
        
        if (this.debugMode) {
            console.log(`📢 状态更新 [${type}]: ${message} (${progress || 0}%)`);
        }
    }

    handleError(context, error) {
        console.error(`❌ ${context}:`, error);
        
        let userFriendlyMessage = error.message;
        
        this.updateStatus(`${context}: ${userFriendlyMessage}`, null, 'error');
        
        // 创建错误提示
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-toast';
        errorDiv.innerHTML = `
            <strong>${context}</strong><br>
            ${userFriendlyMessage}
        `;
        document.body.appendChild(errorDiv);
        
        // 8秒后自动移除错误提示
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 8000);
    }

    handleONNXNotLoaded() {
        const errorMsg = 'ONNX Runtime Web 库加载失败';
        
        console.error('❌ ' + errorMsg);
        
        this.updateStatus('❌ 必要的AI库加载失败，请刷新页面重试', null, 'error');
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-toast';
        errorDiv.innerHTML = `
            <strong>AI引擎加载失败</strong><br>
            ONNX Runtime Web库未能正确加载。
        `;
        document.body.appendChild(errorDiv);
        
        // 禁用处理按钮
        const processBtn = document.getElementById('processBtn');
        if (processBtn) {
            processBtn.disabled = true;
            processBtn.textContent = 'AI库加载失败';
        }
    }

    updateFileStatus(modality, status) {
        const statusEl = document.getElementById(`${modality}Status`);
        if (statusEl) {
            statusEl.textContent = status;
            statusEl.className = `file-status ${this.getStatusClass(status)}`;
        }
    }

    getStatusClass(status) {
        const statusMap = {
            '未上传': '',
            '加载中...': 'loading',
            '已加载': 'uploaded',
            '加载失败': 'error',
            '格式错误': 'error'
        };
        return statusMap[status] || '';
    }

    checkReadyForSegmentation() {
        const isReady = this.fileUploadManager.isAllFilesLoaded();
        const processBtn = document.getElementById('processBtn');
        
        if (processBtn) {
            processBtn.disabled = !isReady;
        }
        
        if (isReady && this.debugMode) {
            console.log('🎯 所有文件已就绪，可以开始分割');
        }
    }

    displayFileInfo() {
        const c0Data = this.fileUploadManager.loadedFiles.c0;
        if (!c0Data) return;
        
        const { dimensions, voxelSize } = c0Data;
        const fileInfo = document.getElementById('fileDetails');
        const fileInfoContainer = document.getElementById('fileInfo');
        
        if (!fileInfo || !fileInfoContainer) return;
        
        fileInfo.innerHTML = `
            <p><strong>📐 图像尺寸:</strong> ${dimensions[0]} × ${dimensions[1]} × ${dimensions[2]}</p>
            <p><strong>📏 体素大小:</strong> ${voxelSize[0].toFixed(2)} × ${voxelSize[1].toFixed(2)} × ${voxelSize[2].toFixed(2)} mm</p>
            <p><strong>✅ 序列状态:</strong> C0, DE, T2 已全部加载</p>
        `;
        fileInfoContainer.style.display = 'block';
    }

    reset() {
        if (this.debugMode) console.log('🔄 重置应用状态');
        
        try {
            this.fileUploadManager.reset();
            this.pipeline.reset();
            this.visualizer.reset();
            
            // 重置文件上传状态
            ['c0', 'de', 't2'].forEach(modality => {
                const input = document.getElementById(`${modality}Upload`);
                if (input) {
                    input.value = '';
                }
                this.updateFileStatus(modality, '未上传');
            });
            
            // 重置按钮状态
            const processBtn = document.getElementById('processBtn');
            const downloadBtn = document.getElementById('downloadBtn');
            const segmentationChoice = document.getElementById('segmentationChoice');
            const fileInfo = document.getElementById('fileInfo');
            
            if (processBtn) processBtn.disabled = true;
            if (downloadBtn) downloadBtn.disabled = true;
            if (segmentationChoice) segmentationChoice.classList.remove('visible');
            if (fileInfo) fileInfo.style.display = 'none';
            
            this.updateStatus('🔄 准备就绪，请上传MyoPS序列文件');
            this.showProgress(false);
            
            // 清除结果数据
            this.originalImages = null;
            this.coarseResult = null;
            this.finalResult = null;
            
            console.log('✅ 应用重置完成');
        } catch (error) {
            console.error('❌ 重置应用失败:', error);
            this.handleError('重置应用失败', error);
        }
    }

    async checkGPUAvailability() {
        try {
            this.updateStatus('🚀 检测到GPU，将使用硬件加速推理', 10, 'success');
        } catch (e) {
            console.warn('GPU检测失败:', e);
            this.updateStatus('⚠️ GPU检测失败，使用CPU推理', 10, 'warning');
        }
    }
}

// 应用初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 MyoPS应用正在初始化...');
    try {
        window.app = new MyoPSApp();
        console.log('✅ MyoPS应用初始化成功');
        
    } catch (error) {
        console.error('❌ MyoPS应用初始化失败:', error);
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-toast';
        errorDiv.innerHTML = `<strong>应用初始化失败</strong><br>${error.message}`;
        document.body.appendChild(errorDiv);
    }
});