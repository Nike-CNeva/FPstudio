
import { ScheduledPart, Part, Tool } from '../../types';
import { PackerItem } from './types';
import { generateId } from '../../utils/helpers';
import { getRotatedExtents } from '../geometry';

/**
 * УЛУЧШЕННАЯ СИСТЕМА СОРТИРОВКИ ДЕТАЛЕЙ
 * Поддерживает множественные стратегии для оптимизации заполнения листа
 */

export type SortStrategy = 
    | 'area-descending'           // По убыванию площади (стандарт)
    | 'perimeter-descending'      // По убыванию периметра
    | 'aspect-ratio'              // Сначала длинные/узкие, потом квадратные
    | 'hybrid-score'              // Гибридная оценка (площадь + форма)
    | 'genetic-optimized';        // Генетическая оптимизация последовательности

/**
 * Рассчитывает периметр детали
 */
const calculatePerimeter = (width: number, height: number): number => {
    return 2 * (width + height);
};

/**
 * Рассчитывает "сложность формы" - отклонение от квадрата
 */
const calculateComplexity = (width: number, height: number): number => {
    const ratio = Math.max(width, height) / Math.min(width, height);
    return ratio; // Чем больше, тем более вытянутая форма
};

/**
 * Гибридная оценка качества детали для упаковки
 * Учитывает площадь, форму и сложность
 */
const calculateHybridScore = (item: PackerItem): number => {
    const areaScore = item.area;
    const complexityScore = calculateComplexity(item.width, item.height);
    const perimeterScore = calculatePerimeter(item.width, item.height);
    
    // Формула: площадь важнее всего, но вытянутые формы получают бонус
    return areaScore * 0.7 + complexityScore * areaScore * 0.2 + perimeterScore * 0.1;
};

/**
 * ГЕНЕТИЧЕСКИЙ АЛГОРИТМ для оптимизации последовательности деталей
 */
class GeneticOptimizer {
    private populationSize = 50;
    private generations = 30;
    private mutationRate = 0.15;
    private eliteSize = 5;

    /**
     * Оценка "приспособленности" последовательности
     * Чем ниже - тем лучше (минимизируем площадь отходов)
     */
    private evaluateFitness(sequence: PackerItem[], sheetW: number, sheetH: number): number {
        // Упрощенная эмуляция упаковки для быстрой оценки
        let currentX = 0;
        let currentY = 0;
        let rowHeight = 0;
        let totalWaste = 0;

        for (const item of sequence) {
            if (currentX + item.width > sheetW) {
                // Новый ряд
                totalWaste += (sheetW - currentX) * rowHeight; // Отходы в конце ряда
                currentX = 0;
                currentY += rowHeight;
                rowHeight = 0;
            }

            currentX += item.width;
            rowHeight = Math.max(rowHeight, item.height);
        }

        // Финальные отходы
        totalWaste += (sheetW - currentX) * rowHeight;
        totalWaste += sheetW * (sheetH - currentY - rowHeight);

        return totalWaste;
    }

    /**
     * Создание начальной популяции
     */
    private createInitialPopulation(items: PackerItem[]): PackerItem[][] {
        const population: PackerItem[][] = [];
        
        // Первая особь - отсортированная по площади
        population.push([...items].sort((a, b) => b.area - a.area));
        
        // Вторая - по периметру
        population.push([...items].sort((a, b) => 
            calculatePerimeter(b.width, b.height) - calculatePerimeter(a.width, a.height)
        ));
        
        // Третья - по гибридной оценке
        population.push([...items].sort((a, b) => calculateHybridScore(b) - calculateHybridScore(a)));
        
        // Остальные - случайные перестановки
        for (let i = 3; i < this.populationSize; i++) {
            const shuffled = [...items];
            for (let j = shuffled.length - 1; j > 0; j--) {
                const k = Math.floor(Math.random() * (j + 1));
                [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
            }
            population.push(shuffled);
        }
        
        return population;
    }

    /**
     * Скрещивание двух родителей (Order Crossover - OX)
     */
    private crossover(parent1: PackerItem[], parent2: PackerItem[]): PackerItem[] {
        const size = parent1.length;
        const start = Math.floor(Math.random() * size);
        const end = start + Math.floor(Math.random() * (size - start));
        
        const child: (PackerItem | null)[] = new Array(size).fill(null);
        
        // Копируем сегмент от parent1
        for (let i = start; i <= end; i++) {
            child[i] = parent1[i];
        }
        
        // Заполняем остальное из parent2 в порядке появления
        let childIdx = (end + 1) % size;
        for (let i = 0; i < size; i++) {
            const p2Idx = (end + 1 + i) % size;
            const item = parent2[p2Idx];
            
            if (!child.includes(item)) {
                child[childIdx] = item;
                childIdx = (childIdx + 1) % size;
            }
        }
        
        return child as PackerItem[];
    }

    /**
     * Мутация (swap mutation - обмен двух элементов)
     */
    private mutate(individual: PackerItem[]): PackerItem[] {
        if (Math.random() > this.mutationRate) return individual;
        
        const mutated = [...individual];
        const idx1 = Math.floor(Math.random() * mutated.length);
        const idx2 = Math.floor(Math.random() * mutated.length);
        
        [mutated[idx1], mutated[idx2]] = [mutated[idx2], mutated[idx1]];
        
        return mutated;
    }

    /**
     * Запуск генетического алгоритма
     */
    optimize(items: PackerItem[], sheetW: number, sheetH: number): PackerItem[] {
        if (items.length < 10) {
            // Для малого количества деталей генетика избыточна
            return items.sort((a, b) => calculateHybridScore(b) - calculateHybridScore(a));
        }

        let population = this.createInitialPopulation(items);
        
        for (let gen = 0; gen < this.generations; gen++) {
            // Оценка приспособленности
            const fitness = population.map(individual => ({
                individual,
                score: this.evaluateFitness(individual, sheetW, sheetH)
            }));
            
            // Сортировка по убыванию приспособленности (меньше отходов = лучше)
            fitness.sort((a, b) => a.score - b.score);
            
            // Элитизм - лучшие особи переходят в следующее поколение
            const newPopulation: PackerItem[][] = fitness.slice(0, this.eliteSize).map(f => f.individual);
            
            // Создание нового поколения
            while (newPopulation.length < this.populationSize) {
                // Турнирная селекция
                const tournament1 = Math.floor(Math.random() * Math.min(10, fitness.length));
                const tournament2 = Math.floor(Math.random() * Math.min(10, fitness.length));
                
                const parent1 = fitness[tournament1].individual;
                const parent2 = fitness[tournament2].individual;
                
                // Скрещивание и мутация
                const child = this.mutate(this.crossover(parent1, parent2));
                newPopulation.push(child);
            }
            
            population = newPopulation;
        }
        
        // Возвращаем лучшую особь
        const finalFitness = population.map(individual => ({
            individual,
            score: this.evaluateFitness(individual, sheetW, sheetH)
        }));
        
        finalFitness.sort((a, b) => a.score - b.score);
        return finalFitness[0].individual;
    }
}

/**
 * Превращает заказ деталей в плоский список с улучшенной сортировкой
 */
export const preparePackerItemsImproved = (
    scheduledParts: ScheduledPart[], 
    allParts: Part[], 
    tools: Tool[],
    strategy: SortStrategy = 'hybrid-score',
    sheetWidth?: number,
    sheetHeight?: number
): PackerItem[] => {
    const items: PackerItem[] = [];
    
    for (const sp of scheduledParts) {
        const part = allParts.find(p => p.id === sp.partId);
        if (!part) continue;

        const initRot = sp.nesting.initialRotation || 0;
        const ext0 = getRotatedExtents(part, initRot, tools);
        const allowed: number[] = [initRot];
        if (sp.nesting.allow0_180) {
            const rot180 = (initRot + 180) % 360;
            if (!allowed.includes(rot180)) allowed.push(rot180);
        }
        if (sp.nesting.allow90_270) {
            const rot90 = (initRot + 90) % 360;
            const rot270 = (initRot + 270) % 360;
            if (!allowed.includes(rot90)) allowed.push(rot90);
            if (!allowed.includes(rot270)) allowed.push(rot270);
        }

        for (let i = 0; i < sp.quantity; i++) {
            items.push({
                uid: generateId(),
                partId: sp.partId,
                name: part.name,
                width: ext0.width,
                height: ext0.height,
                offsetX: ext0.ox,
                offsetY: ext0.oy,
                allowedRotations: allowed,
                preferredRotation: initRot,
                hasCommonLine: sp.nesting.commonLine,
                area: ext0.width * ext0.height,
                aspectRatio: ext0.width / ext0.height
            });
        }
    }

    // Применяем выбранную стратегию сортировки
    switch (strategy) {
        case 'area-descending':
            return items.sort((a, b) => b.area - a.area);
        
        case 'perimeter-descending':
            return items.sort((a, b) => 
                calculatePerimeter(b.width, b.height) - calculatePerimeter(a.width, a.height)
            );
        
        case 'aspect-ratio':
            return items.sort((a, b) => {
                const complexityA = calculateComplexity(a.width, a.height);
                const complexityB = calculateComplexity(b.width, b.height);
                return complexityB - complexityA;
            });
        
        case 'hybrid-score':
            return items.sort((a, b) => calculateHybridScore(b) - calculateHybridScore(a));
        
        case 'genetic-optimized':
            if (!sheetWidth || !sheetHeight) {
                console.warn('Genetic optimization requires sheet dimensions, falling back to hybrid');
                return items.sort((a, b) => calculateHybridScore(b) - calculateHybridScore(a));
            }
            const optimizer = new GeneticOptimizer();
            return optimizer.optimize(items, sheetWidth, sheetHeight);
        
        default:
            return items.sort((a, b) => b.area - a.area);
    }
};
