
/**
 * ОТВЕТСТВЕННОСТЬ: Безопасное выполнение и логирование ошибок в пользовательских скриптах.
 */
export const handleScriptError = (error: any, scriptName: string): never => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ScriptExecutor] Error in "${scriptName}":`, error);
    
    // В будущем здесь можно добавить парсинг стека для указания строки ошибки
    throw new Error(`Ошибка в скрипте "${scriptName}": ${message}`);
};

export const scriptLog = (msg: string, ...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
        console.log(`%c[Script] ${msg}`, 'color: #805ad5; font-weight: bold', ...args);
    }
};
