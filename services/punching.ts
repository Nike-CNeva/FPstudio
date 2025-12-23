
/**
 * СЕРВИС ПРОБИВКИ (Агрегатор)
 * Этот файл является точкой входа для всех функций автоматической и ручной генерации ударов.
 */

export * from './punching/contourMain';
export { generateNibblePunches, generateDestructPunches } from './punchingGenerators';
