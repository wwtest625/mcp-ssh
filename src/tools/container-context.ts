/**
 * 容器上下文管理器
 * 维护当前活跃的容器会话状态，确保命令在正确的容器内执行
 */

export interface ContainerSession {
  connectionId: string;
  containerName: string;
  workingDirectory: string;
  environment: Record<string, string>;
  user?: string;
  lastActivity: Date;
  isActive: boolean;
}

export interface ContainerInfo {
  name: string;
  id: string;
  image: string;
  status: string;
  ports: string[];
  created: Date;
}

export class ContainerContextManager {
  private containerSessions = new Map<string, ContainerSession>();
  private containerCache = new Map<string, ContainerInfo[]>();
  private cacheExpiry = new Map<string, Date>();
  private readonly CACHE_DURATION = 30000; // 30秒缓存

  /**
   * 设置容器会话上下文
   */
  public setContainerContext(
    connectionId: string,
    containerName: string,
    options?: {
      workingDirectory?: string;
      environment?: Record<string, string>;
      user?: string;
    }
  ): void {
    const sessionKey = `${connectionId}:${containerName}`;
    
    this.containerSessions.set(sessionKey, {
      connectionId,
      containerName,
      workingDirectory: options?.workingDirectory || '/root',
      environment: options?.environment || {},
      user: options?.user,
      lastActivity: new Date(),
      isActive: true
    });
  }

  /**
   * 获取容器会话上下文
   */
  public getContainerContext(
    connectionId: string,
    containerName?: string
  ): ContainerSession | null {
    if (containerName) {
      const sessionKey = `${connectionId}:${containerName}`;
      return this.containerSessions.get(sessionKey) || null;
    }

    // 如果没有指定容器名，返回最近活跃的容器会话
    let latestSession: ContainerSession | null = null;
    let latestTime = new Date(0);

    for (const [key, session] of this.containerSessions.entries()) {
      if (session.connectionId === connectionId && 
          session.isActive && 
          session.lastActivity > latestTime) {
        latestSession = session;
        latestTime = session.lastActivity;
      }
    }

    return latestSession;
  }

  /**
   * 更新容器会话活动时间
   */
  public updateActivity(connectionId: string, containerName: string): void {
    const sessionKey = `${connectionId}:${containerName}`;
    const session = this.containerSessions.get(sessionKey);
    
    if (session) {
      session.lastActivity = new Date();
    }
  }

  /**
   * 更新容器工作目录
   */
  public updateWorkingDirectory(
    connectionId: string,
    containerName: string,
    workingDirectory: string
  ): void {
    const sessionKey = `${connectionId}:${containerName}`;
    const session = this.containerSessions.get(sessionKey);
    
    if (session) {
      session.workingDirectory = workingDirectory;
      session.lastActivity = new Date();
    }
  }

  /**
   * 设置容器环境变量
   */
  public setEnvironmentVariable(
    connectionId: string,
    containerName: string,
    key: string,
    value: string
  ): void {
    const sessionKey = `${connectionId}:${containerName}`;
    const session = this.containerSessions.get(sessionKey);
    
    if (session) {
      session.environment[key] = value;
      session.lastActivity = new Date();
    }
  }

  /**
   * 获取容器环境变量
   */
  public getEnvironmentVariables(
    connectionId: string,
    containerName: string
  ): Record<string, string> {
    const sessionKey = `${connectionId}:${containerName}`;
    const session = this.containerSessions.get(sessionKey);
    
    return session?.environment || {};
  }

  /**
   * 清理非活跃的容器会话
   */
  public cleanupInactiveSessions(maxInactiveMinutes: number = 30): void {
    const cutoffTime = new Date(Date.now() - maxInactiveMinutes * 60 * 1000);
    
    for (const [key, session] of this.containerSessions.entries()) {
      if (session.lastActivity < cutoffTime) {
        session.isActive = false;
      }
    }
  }

  /**
   * 获取连接的当前活跃容器（最近使用的）
   */
  public getActiveContainer(connectionId: string): string | null {
    let activeContainer: string | null = null;
    let latestActivity = 0;

    for (const session of this.containerSessions.values()) {
      if (session.connectionId === connectionId && session.isActive) {
        if (session.lastActivity.getTime() > latestActivity) {
          latestActivity = session.lastActivity.getTime();
          activeContainer = session.containerName;
        }
      }
    }

    return activeContainer;
  }

  /**
   * 获取连接的所有活跃容器会话
   */
  public getActiveContainerSessions(connectionId: string): ContainerSession[] {
    const sessions: ContainerSession[] = [];
    
    for (const session of this.containerSessions.values()) {
      if (session.connectionId === connectionId && session.isActive) {
        sessions.push(session);
      }
    }
    
    return sessions.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
  }

  /**
   * 关闭容器会话
   */
  public closeContainerSession(connectionId: string, containerName: string): void {
    const sessionKey = `${connectionId}:${containerName}`;
    const session = this.containerSessions.get(sessionKey);
    
    if (session) {
      session.isActive = false;
    }
  }

  /**
   * 关闭连接的所有容器会话
   */
  public closeAllContainerSessions(connectionId: string): void {
    for (const session of this.containerSessions.values()) {
      if (session.connectionId === connectionId) {
        session.isActive = false;
      }
    }
  }

  /**
   * 构建容器执行命令
   */
  public buildContainerExecCommand(
    containerName: string,
    command: string,
    session?: ContainerSession,
    interactive: boolean = false
  ): string {
    let execCommand = 'docker exec';

    // 只在明确需要交互式时添加 -it 选项
    if (interactive) {
      execCommand += ' -it';
    }

    // 添加工作目录
    if (session?.workingDirectory) {
      execCommand += ` -w ${session.workingDirectory}`;
    }

    // 添加用户
    if (session?.user) {
      execCommand += ` -u ${session.user}`;
    }

    // 添加环境变量
    if (session?.environment) {
      for (const [key, value] of Object.entries(session.environment)) {
        execCommand += ` -e ${key}="${value}"`;
      }
    }

    // 添加容器名和命令
    execCommand += ` ${containerName} ${command}`;

    return execCommand;
  }

  /**
   * 缓存容器列表
   */
  public cacheContainerList(connectionId: string, containers: ContainerInfo[]): void {
    this.containerCache.set(connectionId, containers);
    this.cacheExpiry.set(connectionId, new Date(Date.now() + this.CACHE_DURATION));
  }

  /**
   * 获取缓存的容器列表
   */
  public getCachedContainerList(connectionId: string): ContainerInfo[] | null {
    const expiry = this.cacheExpiry.get(connectionId);
    if (!expiry || expiry < new Date()) {
      // 缓存已过期
      this.containerCache.delete(connectionId);
      this.cacheExpiry.delete(connectionId);
      return null;
    }
    
    return this.containerCache.get(connectionId) || null;
  }

  /**
   * 检查容器是否存在
   */
  public isContainerExists(connectionId: string, containerName: string): boolean {
    const containers = this.getCachedContainerList(connectionId);
    if (!containers) {
      return false;
    }
    
    return containers.some(container => 
      container.name === containerName || container.id.startsWith(containerName)
    );
  }

  /**
   * 获取容器信息
   */
  public getContainerInfo(connectionId: string, containerName: string): ContainerInfo | null {
    const containers = this.getCachedContainerList(connectionId);
    if (!containers) {
      return null;
    }
    
    return containers.find(container => 
      container.name === containerName || container.id.startsWith(containerName)
    ) || null;
  }

  /**
   * 清理所有缓存
   */
  public clearCache(): void {
    this.containerCache.clear();
    this.cacheExpiry.clear();
  }

  /**
   * 获取统计信息
   */
  public getStats(): {
    activeSessions: number;
    totalSessions: number;
    cachedConnections: number;
  } {
    let activeSessions = 0;
    let totalSessions = 0;
    
    for (const session of this.containerSessions.values()) {
      totalSessions++;
      if (session.isActive) {
        activeSessions++;
      }
    }
    
    return {
      activeSessions,
      totalSessions,
      cachedConnections: this.containerCache.size
    };
  }
}
