// 修复的 NIfTI 解析器 - 移除对pako的依赖
class NiftiParser {
    static async parseFile(file, statusCallback = null) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('文件读取失败'));
            
            reader.onload = async (e) => {
                try {
                    let arrayBuffer = e.target.result;
                    
                    // 检查是否为.gz文件，如果是则拒绝
                    if (file.name.endsWith('.gz')) {
                        throw new Error('当前环境不支持.gz文件，请上传未压缩的.nii文件');
                    }
                    
                    if (statusCallback) statusCallback('🔍 检测格式...');
                    const dataView = new DataView(arrayBuffer);
                    
                    // 检测格式
                    const formatInfo = this.detectFormatFixed(dataView);
                    console.log(`文件格式:`, formatInfo);
                    
                    if (!formatInfo.isValid) {
                        throw new Error(`不支持的格式: ${formatInfo.description}`);
                    }
                    
                    // 解析头
                    let header;
                    if (formatInfo.version === 1) {
                        header = this.parseHeaderNIfTI1(dataView, formatInfo.littleEndian);
                    } else {
                        throw new Error('不支持的文件格式，请使用NIfTI-1格式');
                    }
                    
                    if (statusCallback) statusCallback('📊 解析数据...');
                    const imageData = this.parseImageDataSafe(dataView, header);
                    
                    console.log(`✅ 解析成功:`, {
                        文件名: file.name,
                        格式: formatInfo.description,
                        维度: imageData.dimensions,
                        体素大小: imageData.voxelSize
                    });
                    
                    if (statusCallback) statusCallback('✅ 加载完成');
                    resolve(imageData);
                    
                } catch (error) {
                    console.error(`解析错误:`, error);
                    reject(new Error(`NIfTI解析失败: ${error.message}`));
                }
            };
            
            reader.readAsArrayBuffer(file);
        });
    }

    // 修复的格式检测方法
    static detectFormatFixed(dataView) {
        // 检查NIfTI-1格式
        const magicNIfTI1 = this.readBytes(dataView, 344, 4);
        const magicStr = String.fromCharCode(...magicNIfTI1);
        
        console.log('魔数检查:', {
            '位置344': magicNIfTI1,
            '字符串': magicStr,
            '十六进制': Array.from(magicNIfTI1).map(b => b.toString(16)).join(' ')
        });
        
        // NIfTI-1 格式检查
        if (magicStr === 'n+1\0' || magicStr === 'ni1\0') {
            return { isValid: true, version: 1, description: 'NIfTI-1', littleEndian: true };
        }
        
        // 检查大端序
        const magicNIfTI1BE = this.readBytes(dataView, 344, 4, false);
        const magicStrBE = String.fromCharCode(...magicNIfTI1BE);
        
        if (magicStrBE === 'n+1\0' || magicStrBE === 'ni1\0') {
            return { isValid: true, version: 1, description: 'NIfTI-1 (大端序)', littleEndian: false };
        }
        
        // 宽松检查：只要包含n+1或ni1就认为是NIfTI格式
        if (magicStr.includes('n+1') || magicStr.includes('ni1') || 
            magicStrBE.includes('n+1') || magicStrBE.includes('ni1')) {
            console.warn('使用宽松模式检测到NIfTI格式');
            return { isValid: true, version: 1, description: 'NIfTI-1 (宽松模式)', littleEndian: true };
        }
        
        return {
            isValid: false,
            description: '未知格式，请使用标准NIfTI格式',
            magic: magicStr
        };
    }

    static readBytes(dataView, offset, length, littleEndian = true) {
        const bytes = [];
        for (let i = 0; i < length; i++) {
            bytes.push(dataView.getUint8(offset + i));
        }
        return bytes;
    }

    static parseHeaderNIfTI1(dataView, littleEndian) {
        const header = {};
        
        // 维度信息
        header.dim = [];
        const dims = dataView.getInt16(40, littleEndian);
        for (let i = 0; i < 8; i++) {
            header.dim.push(dataView.getInt16(40 + i * 2, littleEndian));
        }
        
        if (header.dim[0] < 1 || header.dim[0] > 7) {
            throw new Error(`不支持的维度数量: ${header.dim[0]}`);
        }
        
        // 体素大小
        header.pixdim = [];
        for (let i = 0; i < 8; i++) {
            header.pixdim.push(dataView.getFloat32(76 + i * 4, littleEndian));
        }
        
        // 数据类型和位深度
        header.datatype = dataView.getInt16(70, littleEndian);
        header.bitpix = dataView.getInt16(72, littleEndian);
        
        // 数据偏移
        header.vox_offset = dataView.getFloat32(108, littleEndian);
        if (header.vox_offset < 352) {
            header.vox_offset = 352; // 标准NIfTI头大小
        }
        
        // 缩放因子
        header.scl_slope = dataView.getFloat32(112, littleEndian);
        header.scl_inter = dataView.getFloat32(116, littleEndian);
        
        if (header.scl_slope === 0) header.scl_slope = 1;
        
        return header;
    }

    static parseImageDataSafe(dataView, header) {
        const dims = header.dim;
        const numDims = dims[0];
        const width = dims[1];
        const height = dims[2];
        const depth = numDims >= 3 ? dims[3] : 1;
        
        if (width <= 0 || height <= 0 || depth <= 0) {
            throw new Error(`无效的尺寸: ${width}x${height}x${depth}`);
        }
        
        const totalVoxels = width * height * depth;
        console.log(`解析图像数据: ${width}×${height}×${depth} = ${totalVoxels.toLocaleString()} 体素`);
        
        const dataOffset = Math.floor(header.vox_offset);
        const bytesPerVoxel = this.getBytesPerVoxel(header.datatype);
        const expectedBytes = dataOffset + totalVoxels * bytesPerVoxel;
        
        if (dataView.byteLength < expectedBytes) {
            throw new Error(`文件不完整: 预期${expectedBytes}字节，实际${dataView.byteLength}字节`);
        }
        
        // 安全方式：逐元素读取
        const rawData = new Float32Array(totalVoxels);
        console.time('读取体素数据');
        
        for (let i = 0; i < totalVoxels; i++) {
            const byteOffset = dataOffset + i * bytesPerVoxel;
            
            switch (header.datatype) {
                case 2: rawData[i] = dataView.getUint8(byteOffset); break;
                case 4: rawData[i] = dataView.getInt16(byteOffset, true); break;
                case 8: rawData[i] = dataView.getInt32(byteOffset, true); break;
                case 16: rawData[i] = dataView.getFloat32(byteOffset, true); break;
                case 64: rawData[i] = dataView.getFloat64(byteOffset, true); break;
                case 512: rawData[i] = dataView.getUint16(byteOffset, true); break;
                default: rawData[i] = dataView.getUint8(byteOffset);
            }
        }
        
        console.timeEnd('读取体素数据');
        
        // 安全方式：应用缩放
        const scaledData = this.applyScaleSafe(rawData, header.scl_slope, header.scl_inter);
        
        // 安全方式：归一化
        const normalizedData = this.normalizeToUint8Safe(scaledData);
        
        return {
            data: normalizedData,
            rawData: scaledData,
            dimensions: [width, height, depth],
            voxelSize: [header.pixdim[1], header.pixdim[2], header.pixdim[3]],
            header: header
        };
    }

    static normalizeToUint8Safe(data) {
        console.time('计算数据范围');
        let min = Infinity;
        let max = -Infinity;
        const len = data.length;
        
        for (let i = 0; i < len; i++) {
            const val = data[i];
            if (val < min) min = val;
            if (val > max) max = val;
        }
        
        const range = max - min;
        console.log(`数据范围: min=${min}, max=${max}, range=${range}`);
        console.timeEnd('计算数据范围');
        
        if (range === 0) {
            console.warn('数据范围为零，返回默认值');
            return new Uint8Array(len).fill(128);
        }
        
        console.time('归一化到Uint8');
        const normalized = new Uint8Array(len);
        const scale = 255.0 / range;
        
        for (let i = 0; i < len; i++) {
            normalized[i] = Math.round((data[i] - min) * scale);
        }
        
        console.timeEnd('归一化到Uint8');
        return normalized;
    }

    static applyScaleSafe(data, slope, intercept) {
        if (slope === 1 && intercept === 0) return data;
        
        console.time('应用缩放');
        const scaled = new Float32Array(data.length);
        const len = data.length;
        
        for (let i = 0; i < len; i++) {
            scaled[i] = data[i] * slope + intercept;
        }
        
        console.timeEnd('应用缩放');
        return scaled;
    }

    static getBytesPerVoxel(datatype) {
        const typeMap = { 2: 1, 4: 2, 8: 4, 16: 4, 64: 8, 512: 2 };
        return typeMap[datatype] || 2;
    }
}