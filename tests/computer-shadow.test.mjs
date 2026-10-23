import { helpers } from './helpers-module.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { addNeutralComputerShadow } = helpers;

test('neutral shadow multiplies RGB equally, with no colored-light subtraction', () => {
    const THREE = { Vector3: class {} };
    let originalCalled = 0;
    const original = function () { originalCalled++; };
    const originalCacheKey = function () { return 'base'; };
    const material = { onBeforeCompile: original, customProgramCacheKey: originalCacheKey };
    const effect = addNeutralComputerShadow(THREE, [material, material]);
    const shader = { uniforms: {}, vertexShader: '#include <worldpos_vertex>',
        fragmentShader: '#include <tonemapping_fragment>' };
    material.onBeforeCompile(shader);
    assert.equal(originalCalled, 1);
    assert.match(shader.vertexShader, /modelMatrix \* vec4\(transformed, 1.0\)/);
    assert.match(shader.fragmentShader, /gl_FragColor.rgb \*= 1.0 \/ \(1.0 \+ computerShadowStrength \* computerAttenuation\)/);
    assert.equal(shader.uniforms.computerShadowCenter, effect.uniforms.computerShadowCenter);
    effect.uniforms.computerShadowStrength.value = 2.4;
    assert.equal(shader.uniforms.computerShadowStrength.value, 2.4);
    assert.match(material.customProgramCacheKey(), /neutral-computer-shadow/);
    effect.dispose();
    assert.equal(material.onBeforeCompile, original);
    assert.equal(material.customProgramCacheKey, originalCacheKey);
});
