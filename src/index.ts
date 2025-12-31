#!/usr/bin/env node

import { SshMCP } from './tools/ssh.js';
import { config } from 'dotenv';
import { ProcessManager } from './process-manager.js';

function debugLog(message: string) {
  const timestamp = new Date().toISOString();
  console.error(`[DEBUG ${timestamp}] ${message}`);
}

// 加载环境变量
debugLog('开始加载环境变量...');
config();
debugLog('环境变量加载完成');

// 主函数
async function main() {
  debugLog('主函数开始执行');

  try {
    // 初始化进程管理器
    debugLog('初始化进程管理器...');
    const processManager = new ProcessManager();

    debugLog('检查并创建进程锁...');
    if (!await processManager.checkAndCreateLock()) {
      debugLog('无法创建进程锁，程序退出');
      console.error('无法创建进程锁，程序退出');
      process.exit(1);
    }
    debugLog('进程锁创建成功');

    // 实例化SSH MCP
    debugLog('实例化SSH MCP...');
    const sshMCP = new SshMCP();
    debugLog('SSH MCP实例化完成');

    // 处理进程退出
    process.on('SIGINT', async () => {
      debugLog('收到SIGINT信号');
      console.error('正在关闭SSH MCP服务...');
      await sshMCP.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      debugLog('收到SIGTERM信号');
      console.error('正在关闭SSH MCP服务...');
      await sshMCP.close();
      process.exit(0);
    });

    // 处理未捕获的异常，避免崩溃
    process.on('uncaughtException', (err) => {
      debugLog(`未捕获的异常: ${err.message}`);
      console.error('未捕获的异常:', err);
      // 不退出进程，保持SSH服务运行
    });

    process.on('unhandledRejection', (reason, promise) => {
      debugLog(`未处理的Promise拒绝: ${reason}`);
      console.error('未处理的Promise拒绝:', reason);
      // 不退出进程，保持SSH服务运行
    });

    debugLog('SSH MCP服务启动完成，等待连接...');
    console.error('SSH MCP服务已启动');

    // 保持进程运行
    debugLog('进入主循环，保持服务运行...');

  } catch (error) {
    debugLog(`主函数执行出错: ${error}`);
    throw error;
  }
}

// 启动应用
debugLog('开始启动应用...');
main().catch(error => {
  debugLog(`应用启动失败: ${error}`);
  console.error('启动失败:', error);
  console.error('错误堆栈:', error.stack);
  process.exit(1);
});