import { WGSL_ALIGN_SIZE_DATA, WGSL_TO_STD40_SIZE } from '../rendering';
import { uniformParsers } from '../rendering/renderers/shared/shader/utils/uniformParsers';
import {
    uniformBufferFunctionsWGSL,
    uniformBufferParsersFunctions,
    uniformBufferSyncFunctionsSTD40
} from './uniformBufferSyncFunctions';

import type { UBOElement, UniformsSyncCallback } from '../rendering/renderers/shared/shader/types';
import type { UniformGroup } from '../rendering/renderers/shared/shader/UniformGroup';
import type { UniformBufferUploadFunction } from './uniformBufferSyncFunctions';

export function generateUniformBufferSyncPolyfillSTD40(uboElements: UBOElement[]): UniformsSyncCallback
{
    return generateUniformBufferSyncPolyfill(
        uboElements,
        uniformBufferSyncFunctionsSTD40,
        (uboElement: UBOElement) =>
        {
            const rowSize = Math.max(WGSL_TO_STD40_SIZE[uboElement.data.type] / 16, 1);
            const elementSize = (uboElement.data.value as Array<number>).length / uboElement.data.size;// size / rowSize;
            const remainder = (4 - (elementSize % 4)) % 4;

            return (_name: string, data: Float32Array, offset: number, _uv: any, v: any) =>
            {
                let t = 0;

                for (let i = 0; i < (uboElement.data.size * rowSize); i++)
                {
                    for (let j = 0; j < elementSize; j++)
                    {
                        data[offset++] = v[t++];
                    }

                    offset += remainder;
                }
            };
        }

    );
}

export function generateUniformBufferSyncPolyfillWGSL(uboElements: UBOElement[]): UniformsSyncCallback
{
    return generateUniformBufferSyncPolyfill(
        uboElements,
        uniformBufferFunctionsWGSL,
        (uboElement: UBOElement) =>
        {
            const { size, align } = WGSL_ALIGN_SIZE_DATA[uboElement.data.type];

            const remainder = (size - align) / 4;

            return (_name: string, data: Float32Array, offset: number, _uv: any, v: any) =>
            {
                let t = 0;

                for (let i = 0; i < uboElement.data.size * (size / 4); i++)
                {
                    for (let j = 0; j < (size / 4); j++)
                    {
                        data[offset++] = v[t++];
                    }
                    offset += remainder;
                }
            };
        }
    );
}

function generateUniformBufferSyncPolyfill(
    uboElements: UBOElement[],
    uniformBufferFunctions: Record<string, UniformBufferUploadFunction>,
    arrayUploadFunction: (uboElement: UBOElement) => UniformBufferUploadFunction
): UniformsSyncCallback
{
    // loop through all the uniforms..
    const functionMap: Record<string, {offset: number, func: UniformBufferUploadFunction}> = {};

    for (const i in uboElements)
    {
        const uboElement = uboElements[i];
        const uniform = uboElement.data;

        let parsed = false;

        functionMap[uniform.name] = {
            offset: uboElement.offset / 4,
            func: null
        };

        for (let j = 0; j < uniformParsers.length; j++)
        {
            const parser = uniformParsers[j];

            if (uniform.type === parser.type && parser.test(uniform))
            {
                functionMap[uniform.name].func = uniformBufferParsersFunctions[j];

                parsed = true;

                break;
            }
        }

        // if not parsed...

        if (!parsed)
        {
            if (uniform.size === 1)
            {
                functionMap[uniform.name].func = uniformBufferFunctions[uniform.type];
            }
            else
            {
                functionMap[uniform.name].func = arrayUploadFunction(uboElement);
            }
        }
    }

    return (
        uniforms: UniformGroup,
        data: Float32Array,
        offset: number
    ) =>
    {
        for (const i in functionMap)
        {
            functionMap[i].func(i, data, offset + functionMap[i].offset, uniforms, uniforms[i as keyof typeof uniforms]);
        }
    };
}
