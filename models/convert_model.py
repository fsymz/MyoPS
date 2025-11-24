import onnxruntime as ort
import onnx
import os

# 检查文件是否存在
model_path = 'models/myops_2d_model_fully_dynamic.onnx'
data_path = 'models/myops_2d_model_fully_dynamic.onnx.data'

print(f"当前工作目录: {os.getcwd()}")
print(f"模型文件存在: {os.path.exists(model_path)}")
print(f"数据文件存在: {os.path.exists(data_path)}")

# 列出当前目录所有文件
print("当前目录文件:")
for file in os.listdir('.'):
    if 'myops' in file.lower() or '.onnx' in file.lower():
        print(f"  - {file}")

if os.path.exists(model_path):
    # 使用ONNX库加载并合并
    model = onnx.load(model_path)
    onnx.save_model(model, 'myops_2d_model_merged.onnx')
    print("模型合并成功!")
else:
    print("模型文件不存在，请检查文件名和路径")