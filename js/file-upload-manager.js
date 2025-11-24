// 统一管理文件上传和验证 - 仅支持.nii文件
class FileUploadManager {
    constructor() {
        this.loadedFiles = { c0: null, de: null, t2: null };
        this.expectedDimensions = null;
    }

    async handleFileUpload(modality, file) {
        this.validateFile(file);
        
        // 传递状态回调，用于显示进度
        const statusCallback = (message) => {
            window.app.updateFileStatus(modality, message);
        };
        
        const imageData = await NiftiParser.parseFile(file, statusCallback);
        
        if (this.expectedDimensions) {
            this.validateDimensions(imageData.dimensions, modality);
        } else {
            this.expectedDimensions = imageData.dimensions;
        }
        
        this.loadedFiles[modality] = imageData;
    }

    validateFile(file) {
        if (!file.name.match(/\.nii$/i)) {
            throw new Error(`文件格式错误: ${file.name} 必须是未压缩的NIfTI格式 (.nii)`);
        }
        
        if (file.size > 200 * 1024 * 1024) { // 200MB
            throw new Error('文件过大，请上传小于200MB的文件');
        }
    }

    validateDimensions(actualDims, modality) {
        const [expW, expH, expD] = this.expectedDimensions;
        const [actW, actH, actD] = actualDims;
        
        if (expW !== actW || expH !== actH || expD !== actD) {
            throw new Error(
                `${modality.toUpperCase()}尺寸不匹配: ` +
                `期望${expW}x${expH}x${expD}, 实际${actW}x${actH}x${actD}`
            );
        }
    }

    isAllFilesLoaded() {
        return Object.values(this.loadedFiles).every(img => img !== null);
    }

    getLoadedImages() {
        return { ...this.loadedFiles };
    }

    reset() {
        this.loadedFiles = { c0: null, de: null, t2: null };
        this.expectedDimensions = null;
    }
}