# Collision-free room encoding — V2

Planning decision — October 13, 2026. Select experimental deterministic RSA block encoding for V2 investigation and implementation. Keep SHA-256 room lookup in V1. This document does not implement or fully specify the cryptographic construction.

## Goal and distinctions

Support distinct storage identities for arbitrarily long canonical room IDs without retaining readable room names or a permanent room recovery index. Computing a stored identifier from a supplied room name should be straightforward, while recovering the name without it should have no retained private-key shortcut.

The procedural world already accepts unbounded canonical IDs through GMP. SHA-256 does not limit world generation, but its fixed 256-bit lookup space cannot distinguish all possible IDs. Collisions must exist over an infinite input domain. Risk depends on the number of distinct stored identities, not distance from room zero or ID length, and is negligible at this project's practical scale.

A collision in V1 could mix image queries, lead to incorrect metadata/file decoding, and allow deletion of an unintended record. Door overrides could also alias if their entire stored endpoint pair matches another pair. V2 aims to remove this lookup ambiguity rather than change world coordinates.

Here, “unbounded” means no fixed identifier-space ceiling; real input, memory, index, and disk capacity remain finite.

## Options considered

| Option | Exact uniqueness over canonical IDs | Recovery behavior |
| --- | --- | --- |
| SHA-256 | No; finite output space | Candidate names can be tested; no direct inverse |
| Fixed-key XOR plus Base64 | Yes with fixed nonempty key | Easily reversed using the key available to the application/developer |
| XOR using a hash of the input as its key | Not guaranteed | Same-length outputs can collide; not an improvement to adopt |
| Hash plus an identity-verification field | Depends on exact verification design | A hash is only a candidate index; finite checksums alone do not guarantee exact identity |
| Deterministic RSA block encoding | Yes if block mapping and full framing are injective | Private-key inversion possible if key retained; guessing remains possible without it |

The selected V2 direction is the last option. The professional concepts are an **injective encoding** built from a **trapdoor permutation**, with computational one-wayness as a goal. This is experimental deterministic encoding, not standard secure RSA encryption.

## Proposed construction

1. Normalize the room through the existing base-36 helpers, preserving equivalence of uppercase/leading-zero forms.
2. Encode the canonical string into a uniquely framed sequence of blocks. Specify encoding, maximum payload per block, final-block length, and fixed output widths. Do not lose leading bytes or make zero padding ambiguous.
3. Map each block to an integer strictly below the RSA modulus.
4. Apply the public RSA primitive `c = m^e mod n` using a correctly generated RSA key. On its specified domain this is a permutation, so distinct block inputs produce distinct outputs.
5. Serialize all outputs without ambiguity or truncation. Different complete room names must remain distinct even across differing lengths/block counts. Do not hash the resulting sequence back to a fixed width.
6. Recompute exactly the same identifier from each requested room name for equality lookup.

Generate the key through a standard library rather than handwritten prime/key generation. Retain only public modulus/exponent and format configuration. The private exponent, prime factors, and any copies containing them must not be retained if removing the direct inversion capability is the goal. Do not claim software generation establishes that no copies ever existed.

Freeze public parameters and the framing rules: changing either changes every lookup identifier. Version the V2 format/configuration independently of the current prefix-free metadata cipher.

## Important limits

- Known or guessed names can always be encoded and compared offline. Short names such as `0` and `tom` remain easy to enumerate.
- Repeated independently encoded blocks reveal equality and may allow block-by-block guessing; total room-name length alone does not establish inversion difficulty.
- Discarding the private key removes a convenient inverse, not the mathematical inverse. Difficulty relies on computational assumptions and input structure; it is not proven absolute impossibility.
- Opening a webpage is not a cryptographic requirement. Knowing the room name supplies the same input offline.
- Raw RSA does not provide the security properties of a standard padded encryption scheme. Ordinary randomized RSA encryption is not a drop-in deterministic lookup encoding. Do not reuse this construction for private credentials or claim vetted confidentiality.
- Exact uniqueness requires reviewing/proving the framing and valid-domain mapping. Round-trip and collision tests provide evidence, not a proof over infinitely many names.

Resolve these details before providing implementation code. Selection of RSA as the V2 direction is not a claim that the current outline already satisfies a strong secrecy specification.

## Application integration

- Introduce a clearly named shared room-lookup encoder in `src/tools.php`; update all `things.room` queries/writes and `holes` endpoint encodings together.
- Sort encoded hole endpoints consistently and retain pair uniqueness. Do not change procedural `edgeHasDoor()` keys, the world seed, canonical URLs, or coordinates.
- Keep room-name-keyed XOR for metadata and image bytes unchanged.
- Keep opaque image `filekey` values independent of room encoding.
- Keep readable logs temporary. No persistent reverse room index and no dependency on logs for normal operation.
- Plan conversion before activation: existing SHA-256 values cannot be reversed to names. Choose a deliberate fresh start or a separately specified conversion process with supplied room names; do not silently mix formats or assume logs are complete.

## Verification and estimate

Check canonical equivalence, room zero, block boundaries, final-block framing, very long IDs, deterministic output, distinct full encodings, both shared-edge directions, and image/door integration. Assess parameter size and lookup/index growth on the Pi. Use disposable test keys to verify inverse behavior during development without retaining a production private key.

Preliminary estimate: **100–180 added/changed lines** for setup, framing/encoding, and application integration, plus **50–100 test lines**. Final estimates depend on the reviewed format and any data conversion. RSA is not a V1 deployment blocker.

## References

- [RFC 8017: RSA cryptography specifications](https://www.rfc-editor.org/rfc/rfc8017), especially the RSAEP primitive and its allowed input domain.
- [PHP GMP modular exponentiation](https://www.php.net/gmp-powm).
