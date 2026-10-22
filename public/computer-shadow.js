// Multiply surface brightness rather than subtracting RGB light, preserving the room's hue.
export function addNeutralComputerShadow(THREE, materials) {
    const uniforms = {
        computerShadowCenter: { value: new THREE.Vector3() },
        computerShadowReach: { value: 1 },
        computerShadowStrength: { value: 0 },
        computerShadowDecay: { value: 0 },
    };
    const originals = [];
    for (const material of new Set(materials.filter(Boolean))) {
        const compile = material.onBeforeCompile, cacheKey = material.customProgramCacheKey;
        originals.push({ material, compile, cacheKey });
        material.onBeforeCompile = function (shader, renderer) {
            compile.call(this, shader, renderer);
            Object.assign(shader.uniforms, uniforms);
            shader.vertexShader = 'varying vec3 vComputerShadowPosition;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>',
                '#include <worldpos_vertex>\nvComputerShadowPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
            shader.fragmentShader = `varying vec3 vComputerShadowPosition;
                uniform vec3 computerShadowCenter;
                uniform float computerShadowReach;
                uniform float computerShadowStrength;
                uniform float computerShadowDecay;\n` + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('#include <tonemapping_fragment>', `
                float computerDistance = length(vComputerShadowPosition - computerShadowCenter);
                float computerFade = pow(clamp(1.0 - pow(computerDistance / max(computerShadowReach, 0.001), 4.0), 0.0, 1.0), 2.0);
                float computerAttenuation = computerFade / pow(max(computerDistance, 0.1), computerShadowDecay);
                gl_FragColor.rgb *= 1.0 / (1.0 + computerShadowStrength * computerAttenuation);
                #include <tonemapping_fragment>`);
        };
        material.customProgramCacheKey = function () { return cacheKey.call(this) + ':neutral-computer-shadow-v1'; };
        material.needsUpdate = true;
    }
    return { uniforms, dispose() {
        for (const { material, compile, cacheKey } of originals) {
            material.onBeforeCompile = compile;
            material.customProgramCacheKey = cacheKey;
            material.needsUpdate = true;
        }
    } };
}
