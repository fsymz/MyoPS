# download_onnx_stable.py
import os
import urllib.request
import ssl

ssl._create_default_https_context = ssl._create_unverified_context

def download_onnx_stable():
    print("🚀 下载稳定的 ONNX Runtime Web 1.17.0 文件...")
    
    os.makedirs('js/onnxruntime', exist_ok=True)
    
    # 使用更稳定的 1.17.0 版本
    base_url = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.0/dist/'
    
    files = [
        'ort.min.js',
        'ort-wasm-simd-threaded.wasm',
        'ort-wasm.wasm'
    ]
    
    success_count = 0
    for filename in files:
        save_path = f'js/onnxruntime/{filename}'
        url = base_url + filename
        
        try:
            print(f'⬇️  下载 {filename}...')
            urllib.request.urlretrieve(url, save_path)
            file_size = os.path.getsize(save_path)
            print(f'✅ {filename} 下载完成 ({file_size} 字节)')
            success_count += 1
        except Exception as e:
            print(f'❌ {filename} 下载失败: {e}')
    
    return success_count

def main():
    print("开始下载稳定的 ONNX Runtime Web 1.17.0 文件...")
    success_count = download_onnx_stable()
    
    if success_count >= 2:
        print(f"\n🎉 成功! 下载了 {success_count} 个文件")
        print("现在请修改 index.html 使用 1.17.0 版本")
    else:
        print("\n❌ 下载失败")

if __name__ == '__main__':
    main()