import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// 锁文件路径配置
export class ProcessManager {
  private instanceId: string;
  private lockFile: string;

  private debugLog(message: string) {
    const timestamp = new Date().toISOString();
    console.error(`[PROCESS-MGR DEBUG ${timestamp}] ${message}`);
  }

  constructor() {
    this.debugLog('ProcessManager构造函数开始');

    // 生成唯一实例ID
    this.instanceId = Date.now().toString();
    this.debugLog(`生成实例ID: ${this.instanceId}`);

    this.lockFile = this.resolveLockFile();
    this.ensureLockDirExists();

    // 注册进程退出处理
    this.debugLog('注册清理处理程序...');
    this.registerCleanup();
    this.debugLog('ProcessManager构造函数完成');
  }

  private resolveLockFile(): string {
    const envLockPath = process.env.MCP_SSH_LOCK_PATH;
    if (envLockPath && envLockPath.trim().length > 0) {
      return path.resolve(envLockPath);
    }

    const dataPath = process.env.SSH_DATA_PATH || path.join(os.homedir(), '.mcp-ssh');
    return path.join(dataPath, '.mcp-ssh.lock');
  }

  private ensureLockDirExists(): void {
    const lockDir = path.dirname(this.lockFile);
    if (!fs.existsSync(lockDir)) {
      fs.mkdirSync(lockDir, { recursive: true });
    }
  }

  private registerCleanup(): void {
    // 注册多个信号以确保清理
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
    process.on('exit', () => this.cleanup());
  }

  private cleanup(): void {
    try {
      if (fs.existsSync(this.lockFile)) {
        const lockData = JSON.parse(fs.readFileSync(this.lockFile, 'utf8'));
        // 只清理自己的锁文件
        if (lockData.instanceId === this.instanceId) {
          fs.unlinkSync(this.lockFile);
        }
      }
    } catch (error) {
      console.error('Error cleaning up lock file:', error);
    }
  }

  private async waitForProcessExit(pid: number, maxWaitTime: number = 5000): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitTime) {
      try {
        process.kill(pid, 0);
        // 如果进程还在运行，等待100ms后再次检查
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (e) {
        // 进程已经退出
        return true;
      }
    }
    return false;
  }

  public async checkAndCreateLock(): Promise<boolean> {
    this.debugLog('开始检查和创建进程锁');
    this.debugLog(`锁文件路径: ${this.lockFile}`);

    try {
      // 检查锁文件是否存在
      if (fs.existsSync(this.lockFile)) {
        this.debugLog('发现已存在的锁文件');
        const lockData = JSON.parse(fs.readFileSync(this.lockFile, 'utf8'));
        this.debugLog(`锁文件内容: ${JSON.stringify(lockData)}`);

        try {
          // 检查进程是否还在运行
          this.debugLog(`检查进程 ${lockData.pid} 是否还在运行...`);
          process.kill(lockData.pid, 0);
          this.debugLog('发现已存在的MCP-SSH实例，正在终止旧进程...');
          console.error('发现已存在的MCP-SSH实例，正在终止旧进程...');

          // 发送终止信号给旧进程
          process.kill(lockData.pid, 'SIGTERM');

          // 等待旧进程退出
          this.debugLog('等待旧进程退出...');
          const exited = await this.waitForProcessExit(lockData.pid);
          if (!exited) {
            this.debugLog('等待旧进程退出超时');
            console.error('等待旧进程退出超时');
            return false;
          }
          this.debugLog('旧进程已退出');

          // 删除旧的锁文件
          fs.unlinkSync(this.lockFile);
          this.debugLog('旧锁文件已删除');
        } catch (e) {
          // 进程不存在，删除旧的锁文件
          this.debugLog(`旧进程不存在: ${e}`);
          console.error('发现旧的锁文件但进程已不存在，正在清理...');
          fs.unlinkSync(this.lockFile);
          this.debugLog('旧锁文件已清理');
        }
      } else {
        this.debugLog('未发现已存在的锁文件');
      }

      // 创建新的锁文件
      const lockData = {
        pid: process.pid,
        instanceId: this.instanceId,
        timestamp: Date.now()
      };
      this.debugLog(`创建新锁文件，内容: ${JSON.stringify(lockData)}`);
      fs.writeFileSync(this.lockFile, JSON.stringify(lockData));

      this.debugLog('MCP-SSH进程锁创建成功');
      console.error('MCP-SSH进程锁创建成功');
      return true;
    } catch (error) {
      this.debugLog(`处理锁文件时出错: ${error}`);
      console.error('处理锁文件时出错:', error);
      return false;
    }
  }
} 
