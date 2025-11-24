# download_onnx_web_fixed.py
import os
import urllib.request
import ssl

# 解决可能的SSL证书问题
ssl._create_default_https_context = ssl._create_unverified_context

def download_onnx_web():
    print("🚀 下载 ONNX Runtime Web 文件...")
    
    # 创建目录
    os.makedirs('js/onnxruntime', exist_ok=True)
    
    # 使用不同的CDN地址
    base_urls = [
        'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/',
        'https://unpkg.com/onnxruntime-web@1.23.2/dist/'
    ]
    
    files = [
        'ort.min.js',
        'ort-wasm-simd-threaded.wasm',
        'ort-wasm.wasm'
    ]
    
    success_count = 0
    for filename in files:
        save_path = f'js/onnxruntime/{filename}'
        
        # 尝试不同的CDN
        for base_url in base_urls:
            url = base_url + filename
            try:
                print(f'⬇️  从 {base_url} 下载 {filename}...')
                urllib.request.urlretrieve(url, save_path)
                file_size = os.path.getsize(save_path)
                print(f'✅ {filename} 下载完成 ({file_size} 字节)')
                success_count += 1
                break  # 成功下载就跳出CDN循环
            except Exception as e:
                print(f'❌ 从 {base_url} 下载失败: {e}')
                continue
    
    return success_count

def main():
    print("开始下载 ONNX Runtime Web 1.23.2 文件...")
    success_count = download_onnx_web()
    
    if success_count >= 2:
        print(f"\n🎉 成功! 下载了 {success_count} 个文件")
        print("📁 文件保存在: js/onnxruntime/")
        
        # 列出下载的文件
        print("\n下载的文件列表:")
        for file in os.listdir('js/onnxruntime'):
            size = os.path.getsize(f'js/onnxruntime/{file}')
            print(f"  - {file} ({size} 字节)")
            
        print("\n✅ 现在可以启动本地服务器测试了！")
    else:
        print("\n❌ 下载失败，请尝试方法2")

if __name__ == '__main__':
    main()