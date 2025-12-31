/**
 * Docker命令解析器
 * 用于解析和处理Docker相关命令，确保命令正确在容器内执行
 */

export interface DockerExecCommand {
  containerName: string;
  command: string;
  options: string[];
  workdir?: string;
  user?: string;
  env?: Record<string, string>;
}

export interface ParsedCommand {
  type: 'docker_exec' | 'docker_run' | 'regular' | 'compound';
  originalCommand: string;
  dockerCommands: DockerExecCommand[];
  regularCommands: string[];
  needsContainerContext?: boolean;
}

export class DockerCommandParser {
  // Docker exec命令的正则表达式 - 改进版本，更好地处理选项
  private static readonly DOCKER_EXEC_REGEX = /docker\s+exec\s+(?<options>(?:-[a-zA-Z]+(?:\s+\S+)?\s*)*)\s*(?<container>\S+)\s+(?<command>.+)/i;

  // Docker run命令的正则表达式
  private static readonly DOCKER_RUN_REGEX = /docker\s+run\s+(?<options>(?:-[a-zA-Z]+(?:\s+\S+)?\s*)*)\s*(?<image>\S+)\s*(?<command>.*)/i;
  
  // 复合命令分隔符
  private static readonly COMPOUND_SEPARATORS = /\s*(?:&&|\|\||;)\s*/;

  /**
   * 解析命令字符串
   */
  public static parseCommand(command: string): ParsedCommand {
    const trimmedCommand = command.trim();
    
    // 检查是否包含复合命令
    if (this.isCompoundCommand(trimmedCommand)) {
      return this.parseCompoundCommand(trimmedCommand);
    }
    
    // 检查是否是docker exec命令
    if (this.isDockerExecCommand(trimmedCommand)) {
      const dockerCommand = this.parseDockerExecCommand(trimmedCommand);
      return {
        type: 'docker_exec',
        originalCommand: trimmedCommand,
        dockerCommands: dockerCommand ? [dockerCommand] : [],
        regularCommands: []
      };
    }
    
    // 检查是否是docker run命令
    if (this.isDockerRunCommand(trimmedCommand)) {
      return {
        type: 'docker_run',
        originalCommand: trimmedCommand,
        dockerCommands: [],
        regularCommands: [trimmedCommand]
      };
    }
    
    // 普通命令
    return {
      type: 'regular',
      originalCommand: trimmedCommand,
      dockerCommands: [],
      regularCommands: [trimmedCommand]
    };
  }

  /**
   * 检查是否是复合命令
   */
  private static isCompoundCommand(command: string): boolean {
    return this.COMPOUND_SEPARATORS.test(command);
  }

  /**
   * 检查是否是docker exec命令
   */
  private static isDockerExecCommand(command: string): boolean {
    return this.DOCKER_EXEC_REGEX.test(command);
  }

  /**
   * 检查是否是docker run命令
   */
  private static isDockerRunCommand(command: string): boolean {
    return this.DOCKER_RUN_REGEX.test(command);
  }

  /**
   * 解析复合命令
   */
  private static parseCompoundCommand(command: string): ParsedCommand {
    const parts = command.split(this.COMPOUND_SEPARATORS);
    const dockerCommands: DockerExecCommand[] = [];
    const regularCommands: string[] = [];
    let hasDockerExec = false;

    for (const part of parts) {
      const trimmedPart = part.trim();
      if (!trimmedPart) continue;

      if (this.isDockerExecCommand(trimmedPart)) {
        const dockerCommand = this.parseDockerExecCommand(trimmedPart);
        if (dockerCommand) {
          dockerCommands.push(dockerCommand);
          hasDockerExec = true;
        }
      } else {
        regularCommands.push(trimmedPart);
      }
    }

    return {
      type: 'compound',
      originalCommand: command,
      dockerCommands,
      regularCommands,
      needsContainerContext: hasDockerExec && regularCommands.length > 0
    };
  }

  /**
   * 解析docker exec命令 - 改进版本
   */
  private static parseDockerExecCommand(command: string): DockerExecCommand | null {
    // 使用更精确的解析方法
    const parts = command.trim().split(/\s+/);

    if (parts.length < 3 || parts[0] !== 'docker' || parts[1] !== 'exec') {
      return null;
    }

    let i = 2; // 从 'exec' 后开始
    const options: string[] = [];
    let workdir: string | undefined;
    let user: string | undefined;
    const env: Record<string, string> = {};

    // 解析选项
    while (i < parts.length && parts[i].startsWith('-')) {
      const option = parts[i];

      if (option === '-w' || option === '--workdir') {
        if (i + 1 < parts.length) {
          workdir = parts[++i];
        }
      } else if (option === '-u' || option === '--user') {
        if (i + 1 < parts.length) {
          user = parts[++i];
        }
      } else if (option === '-e' || option === '--env') {
        if (i + 1 < parts.length) {
          const envVar = parts[++i];
          if (envVar.includes('=')) {
            const [key, value] = envVar.split('=', 2);
            env[key] = value;
          }
        }
      } else {
        options.push(option);
        // 某些选项可能需要参数
        if ((option === '-p' || option === '-v' || option === '--name') &&
            i + 1 < parts.length && !parts[i + 1].startsWith('-')) {
          options.push(parts[++i]);
        }
      }
      i++;
    }

    // 容器名应该是下一个非选项参数
    if (i >= parts.length) {
      return null;
    }

    const containerName = parts[i++];

    // 剩余的部分是命令
    if (i >= parts.length) {
      return null;
    }

    const cmd = parts.slice(i).join(' ');

    return {
      containerName,
      command: cmd,
      options,
      workdir,
      user,
      env
    };
  }

  /**
   * 解析Docker选项
   */
  private static parseDockerOptions(optionsString: string): {
    flags: string[];
    workdir?: string;
    user?: string;
    env: Record<string, string>;
  } {
    const flags: string[] = [];
    const env: Record<string, string> = {};
    let workdir: string | undefined;
    let user: string | undefined;

    if (!optionsString.trim()) {
      return { flags, workdir, user, env };
    }

    // 改进的选项解析 - 处理组合选项如 -it
    const optionParts = optionsString.trim().split(/\s+/);

    for (let i = 0; i < optionParts.length; i++) {
      const part = optionParts[i];

      if (part === '-w' || part === '--workdir') {
        if (i + 1 < optionParts.length) {
          workdir = optionParts[++i];
        }
      } else if (part === '-u' || part === '--user') {
        if (i + 1 < optionParts.length) {
          user = optionParts[++i];
        }
      } else if (part === '-e' || part === '--env') {
        if (i + 1 < optionParts.length) {
          const envVar = optionParts[++i];
          if (envVar && envVar.includes('=')) {
            const [key, value] = envVar.split('=', 2);
            env[key] = value;
          }
        }
      } else if (part.startsWith('-')) {
        // 处理组合选项如 -it, -d 等
        if (part.startsWith('--')) {
          // 长选项
          flags.push(part);
          // 检查是否有值
          if (i + 1 < optionParts.length && !optionParts[i + 1].startsWith('-')) {
            flags.push(optionParts[++i]);
          }
        } else {
          // 短选项，可能是组合的
          flags.push(part);
          // 对于某些需要参数的选项，检查下一个参数
          const needsValue = ['-p', '-v', '-m', '-c', '--name'].some(opt => part.includes(opt.slice(1)));
          if (needsValue && i + 1 < optionParts.length && !optionParts[i + 1].startsWith('-')) {
            flags.push(optionParts[++i]);
          }
        }
      }
    }

    return { flags, workdir, user, env };
  }

  /**
   * 将解析后的命令重新构建为在容器内执行的命令
   */
  public static buildContainerCommand(
    parsedCommand: ParsedCommand, 
    defaultContainer?: string
  ): string[] {
    const commands: string[] = [];

    if (parsedCommand.type === 'regular') {
      return parsedCommand.regularCommands;
    }

    if (parsedCommand.type === 'docker_exec') {
      // 直接返回原始docker exec命令
      return [parsedCommand.originalCommand];
    }

    if (parsedCommand.type === 'compound' && parsedCommand.needsContainerContext) {
      // 对于复合命令，需要特殊处理
      let currentContainer = defaultContainer;
      
      // 首先执行所有docker exec命令，获取最后一个容器名
      for (const dockerCmd of parsedCommand.dockerCommands) {
        commands.push(this.buildDockerExecCommand(dockerCmd));
        currentContainer = dockerCmd.containerName;
      }
      
      // 然后将所有常规命令包装到最后一个容器中执行
      if (currentContainer && parsedCommand.regularCommands.length > 0) {
        const combinedCommand = parsedCommand.regularCommands.join(' && ');
        commands.push(`docker exec ${currentContainer} sh -c "${combinedCommand}"`);
      }
    } else {
      // 其他情况直接返回原始命令
      commands.push(parsedCommand.originalCommand);
    }

    return commands;
  }

  /**
   * 构建docker exec命令字符串
   */
  private static buildDockerExecCommand(dockerCmd: DockerExecCommand): string {
    let command = 'docker exec';
    
    // 添加选项
    if (dockerCmd.options.length > 0) {
      command += ' ' + dockerCmd.options.join(' ');
    }
    
    // 添加工作目录
    if (dockerCmd.workdir) {
      command += ` -w ${dockerCmd.workdir}`;
    }
    
    // 添加用户
    if (dockerCmd.user) {
      command += ` -u ${dockerCmd.user}`;
    }
    
    // 添加环境变量
    if (dockerCmd.env) {
      for (const [key, value] of Object.entries(dockerCmd.env)) {
        command += ` -e ${key}=${value}`;
      }
    }
    
    // 添加容器名和命令
    command += ` ${dockerCmd.containerName} ${dockerCmd.command}`;
    
    return command;
  }

  /**
   * 检查命令是否需要容器上下文
   */
  public static needsContainerContext(command: string): boolean {
    const parsed = this.parseCommand(command);
    return parsed.needsContainerContext || false;
  }

  /**
   * 提取容器名称
   */
  public static extractContainerName(command: string): string | null {
    const parsed = this.parseCommand(command);
    
    if (parsed.dockerCommands.length > 0) {
      // 返回最后一个docker命令的容器名
      return parsed.dockerCommands[parsed.dockerCommands.length - 1].containerName;
    }
    
    return null;
  }
}
