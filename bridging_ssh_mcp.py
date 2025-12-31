import sys
import os
import subprocess
import signal
import time

CREATE_NO_WINDOW = 0x08000000

proc = None

def debug_print(message):
    """调试输出函数"""
    print(f"[DEBUG] {time.strftime('%H:%M:%S')} - {message}", file=sys.stderr, flush=True)

def handle_termination(signum, frame):
    debug_print(f"收到终止信号: {signum}")
    if proc and proc.poll() is None:
        debug_print("正在终止子进程...")
        try:
            proc.terminate()
            proc.wait(timeout=1)
            debug_print("子进程已正常终止")
        except:
            debug_print("强制杀死子进程...")
            try:
                proc.kill()
                debug_print("子进程已被强制杀死")
            except:
                debug_print("无法杀死子进程")
                pass
    sys.exit(0)

def main():
    global proc

    debug_print("启动 SSH MCP 桥接程序...")

    signal.signal(signal.SIGINT, handle_termination)
    signal.signal(signal.SIGTERM, handle_termination)

    try:
        # 获取当前脚本所在目录
        current_dir = os.path.dirname(os.path.abspath(__file__))
        debug_print(f"当前目录: {current_dir}")

        # 构建 dist/index.js 的路径
        index_js_path = os.path.join(current_dir, 'dist', 'index.js')
        debug_print(f"目标文件路径: {index_js_path}")

        # 检查文件是否存在
        if not os.path.exists(index_js_path):
            debug_print(f"错误: 文件不存在 - {index_js_path}")
            sys.exit(1)

        # 检查 node 是否可用
        try:
            node_version = subprocess.check_output(['node', '--version'], stderr=subprocess.STDOUT, text=True)
            debug_print(f"Node.js 版本: {node_version.strip()}")
        except Exception as e:
            debug_print(f"Node.js 不可用: {e}")
            sys.exit(1)

        command = f"node {index_js_path}"
        debug_print(f"执行命令: {command}")

        proc = subprocess.Popen(
            command,
            stdin=sys.stdin,
            stdout=sys.stdout,
            stderr=sys.stderr,
            shell=True,
            env=os.environ,
            **({"creationflags": CREATE_NO_WINDOW} if os.name == "nt" else {})
        )

        debug_print(f"子进程已启动，PID: {proc.pid}")

        # 等待一小段时间检查进程是否立即退出
        time.sleep(0.5)
        if proc.poll() is not None:
            debug_print(f"子进程已退出，返回码: {proc.returncode}")
        else:
            debug_print("子进程正在运行，等待完成...")

        proc.wait()
        debug_print(f"子进程完成，返回码: {proc.returncode}")

    except Exception as e:
        debug_print(f"发生异常: {str(e)}")
        import traceback
        debug_print(f"异常详情: {traceback.format_exc()}")
    finally:
        if proc and proc.poll() is None:
            debug_print("清理残留进程...")
            handle_termination(None, None)

    exit_code = proc.returncode if proc else 1
    debug_print(f"程序退出，退出码: {exit_code}")
    sys.exit(exit_code)

if __name__ == "__main__":
    main() 