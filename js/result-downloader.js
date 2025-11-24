// 生成可下载的NIfTI格式结果
class ResultDownloader {
    downloadNifti(segmentationData, referenceHeader, filename) {
        try {
            const niftiData = this.createNiftiFile(segmentationData, referenceHeader);
            const blob = new Blob([niftiData], { type: 'application/octet-stream' });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            
            URL.revokeObjectURL(url);
        } catch (error) {
            throw new Error('生成下载文件失败: ' + error.message);
        }
    }

    createNiftiFile(segmentationData, referenceHeader) {
        const { data, dimensions } = segmentationData;
        const [width, height, depth] = dimensions;
        
        const headerSize = 352;
        const header = new ArrayBuffer(headerSize);
        const view = new DataView(header);
        
        // 魔数
        for (let i = 0; i < 4; i++) {
            view.setUint8(344 + i, 'n+1\0'.charCodeAt(i));
        }
        
        // 维度
        view.setInt16(40, 3, true);
        view.setInt16(42, width, true);
        view.setInt16(44, height, true);
        view.setInt16(46, depth, true);
        
        // 数据类型
        view.setInt16(70, 2, true);
        view.setInt16(72, 8, true);
        
        // 体素大小
        view.setFloat32(76, referenceHeader.pixdim[1], true);
        view.setFloat32(80, referenceHeader.pixdim[2], true);
        view.setFloat32(84, referenceHeader.pixdim[3], true);
        
        // 数据偏移
        view.setFloat32(108, headerSize, true);
        view.setFloat32(112, 1.0, true);
        view.setFloat32(116, 0.0, true);
        
        const dataArray = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) {
            dataArray[i] = data[i];
        }
        
        const niftiFile = new Uint8Array(headerSize + dataArray.length);
        niftiFile.set(new Uint8Array(header), 0);
        niftiFile.set(dataArray, headerSize);
        
        return niftiFile.buffer;
    }
}