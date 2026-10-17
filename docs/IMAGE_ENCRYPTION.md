# Image encryption and visual scrambling options

Planning reference — October 8, 2026. These options are deferred; no image encryption approach has been selected or implemented.

## Scope and assumptions

V2 room-lookup direction: [ROOM_ENCODING_V2.md](ROOM_ENCODING_V2.md) selects experimental RSA block encoding to avoid identity collisions. V1 retains SHA-256. This future lookup change does not replace the room-name-keyed XOR used for image metadata or original image bytes, and does not affect opaque file naming or GIF preservation.

Extend the room-based metadata concealment described in [ROOM_STORAGE_PLAN.md](ROOM_STORAGE_PLAN.md) to the actual uploaded image files. That document currently leaves image bytes unchanged; this document records possible extensions without changing its selected metadata design.

The database is empty, and there are no existing uploaded images to preserve, so no existing-file migration is planned. Estimates below are additional to the metadata hashing/scrambling work and exclude tests. They count roughly added or changed PHP lines, not measured patches.

Two homemade options are under consideration: XOR the original file bytes, or scramble decoded pixels into a valid PNG that looks like static. AES-GCM is a standard encryption alternative. Room-based homemade scrambling is a conceptual exercise and casual concealment, not an access-control mechanism.

## Shared application changes

### Opaque stored names and readable display names

October 12 decision: uploaded files must have opaque names on disk, while the room page displays the readable uploaded name (for example `my-dog.jpg`). Keep these as separate values:

- `filename`: readable display name, stored with the room-based metadata cipher and restored for page labels and temporary logs.
- `storage_key`: opaque file identifier used for locating/deleting stored files, with no readable room or original filename embedded in it. This can remain readable as an opaque reference, supporting global image cleanup without room-name recovery.

Prefer a random identifier such as `bin2hex(random_bytes(16))` over a plain hash of the original filename: hashing predictable names permits guessing and repeated names can collide. If an actual hash is desired, include a fresh random value in its input. Opaque naming and byte scrambling are distinct operations.

For scrambled byte files, use an extension such as `.foo`; keeping `.jpg` would not make scrambled bytes a valid JPEG. The serving endpoint restores the original content type, and page labels/download names use the decoded readable filename. Do not reconstruct disk paths from the display name after adopting `storage_key`.

Update schema, upload, serving, deletion, and admin reset together for this separation. The current metadata pass still uses a single filename; implement the split with image storage/delivery. Fresh-database setup is selected, so no existing-record/file migration is required.

1. Validate the uploaded image before transforming it.
2. Store transformed files outside the web root, for example in `data/images/`.
3. Add an endpoint such as `/image.php?room=tom&id=123` that normalizes the room ID, looks up the image by ID and room hash, decodes its filename metadata, and restores the image in memory.
4. Return the restored bytes with the correct image content type, without saving a restored copy on the server.
5. Update image links and modal sources to use that endpoint, and update deletion to remove the transformed file from its new location.

Use the same canonical base-36 room IDs and shared room-hash helper as the metadata plan. Resolve file paths from the database record; the endpoint should not accept an arbitrary filesystem path. Keep upload cleanup on failed database insertion and handle missing or invalid files consistently.

The modal does not hide the route. The current modal takes its image source from the clicked link, so the endpoint URL remains visible in page links, the image source, and browser network requests. Visitors can copy the URL and open it directly. Images delivered to the browser remain viewable and downloadable.

## Option A: XOR the original file bytes

Repeat the canonical room-name bytes across the uploaded file and XOR each file byte with the corresponding room-name byte. Applying the same operation again restores the original bytes exactly, including the original file format and embedded metadata.

Store the result as binary data, for example in a `.foo` file, with a small versioned header that the serving endpoint validates. Unlike the database metadata values, binary files do not need Base64 encoding. Preserve or recover the original content type for the response.

These remain static files on disk, but their contents cannot be displayed as ordinary images. An image viewer would see an invalid file; opening them as binary data would show scrambled bytes. The PHP endpoint restores JPEG, PNG, GIF, or WebP bytes for the browser.

### Layperson steps and rough effort

| Step | One-line description | Rough lines |
| --- | --- | ---: |
| Make it reversible | Write a helper that scrambles and restores file bytes using the room name. | 20–35 |
| Save uploads | Scramble the validated image and save its unreadable bytes. | 20–35 |
| Display images | Add a route that restores the bytes and sends the image to the modal. | 30–50 |
| Connect everything | Update image links and deletion to use the new route and storage location. | 10–20 |
| **Total** | | **80–140** |

This can be implemented manually in PHP without an additional package or image-processing extension. It preserves original file bytes, including animation, because it does not decode or re-encode the image.

Repeating-key XOR has no tamper detection. Predictable image headers can expose the repeated key, and room names are guessable. It should not be treated as dependable confidentiality.

## Option B: scramble pixels into a static-looking PNG

Decode the uploaded still image, transform its pixel colors reversibly using the canonical room name, and save the transformed pixels as a valid lossless PNG. Opening the stored PNG would show a scrambled image resembling visual noise. The serving endpoint reverses the transformation and returns a restored image to the browser.

For the noise effect, XOR RGB values with a reproducible byte stream derived from the room name and pixel position. Freeze and version the byte-stream rules before storing files. Repeating the same operation restores the RGB values. A room-derived homemade stream is still guessable and is not a vetted encryption scheme.

Pixel-block shuffling is another possible visual style: it produces a mosaic with potentially recognizable fragments rather than TV-like static. A reversible block permutation would need its own specified rules; the estimate below covers color scrambling, not an additional block-shuffling implementation.

### Layperson steps and rough effort

| Step | One-line description | Rough lines |
| --- | --- | ---: |
| Make it reversible | Write a helper that scrambles and restores pixel colors using the room name. | 50–90 |
| Save uploads | Scramble the validated image's pixels and save a static-looking PNG. | 25–40 |
| Display images | Add a route that restores the pixels and sends the image to the modal. | 50–80 |
| Connect everything | Update image links and deletion to use the new route and storage location. | 15–30 |
| **Total** | | **140–240** |

The earlier conversation rounded this to approximately 150–250 lines; both are rough estimates of the same scope.

### Format and processing details

- Use PHP's GD extension or an equivalent image-processing library. No Composer package or external command-line tool is needed with GD, but the extension and relevant format support must be installed.
- Save transformed pixels as lossless PNG. JPEG compression changes pixel values and prevents exact reversal of the pixel operation.
- Restore the decoded pixel representation, not the original uploaded file bytes, compression, or embedded metadata. The delivered image can be PNG regardless of the upload format.
- Define and verify transparency handling. Preserving alpha can reveal silhouettes and fully transparent pixels will not look like visible static. Scrambling alpha would require a separate reversible design decision.
- Animated GIF/WebP handling is outside this estimate. Restrict the initial pixel-scrambling implementation to still images rather than silently discarding frames.
- Noisy PNGs may be substantially larger than the original compressed image. Decoding, pixel loops, and re-encoding also cost more CPU and memory than transforming file bytes.
- A valid PNG still exposes dimensions and image structure. The homemade transformation does not authenticate the pixels or detect tampering.

## Option C: AES-GCM through PHP's OpenSSL extension

Use PHP's existing encryption functions to encrypt the original file bytes with AES-GCM. Write the file handling and application integration ourselves; implementing AES from scratch is unnecessary.

The OpenSSL extension must be available, but no Composer dependency or external tool is needed. PHP documents authenticated encryption with GCM in its [openssl_encrypt reference](https://www.php.net/manual/en/function.openssl-encrypt.php).

Store a versioned binary envelope containing a fresh nonce, authentication tag, and ciphertext. Generate a fresh nonce for each encryption, validate the envelope and expected tag length, and reject failed authentication before serving any plaintext.

Key choices have different implications:

- **Room-derived key:** derive a correctly sized key deterministically from the canonical room ID. The cipher is standard, but anyone who guesses the room can derive its key; this does not make room names secret.
- **Private server key:** use a randomly generated key kept outside the repository and web root. This provides protection for stored files when the key remains separate and private. Key backup and recovery become necessary; losing the key loses access to the encrypted images. If room-specific keys are wanted, derive them using the server secret and canonical room ID through a specified standard construction.

Do not simply pass an arbitrary room name as the OpenSSL key and assume PHP performs a password derivation step. The exact key construction remains a decision for this option.

Estimated application work: **120–200 added or changed lines**, excluding migration and tests. This includes helpers, upload/deletion changes, the serving endpoint, and updated links. Stored files look like unreadable binary data, not valid images. Original bytes and animation can be preserved.

AES-GCM adds tamper detection and standard encryption. It still does not make a public image endpoint private: visitors receive ordinary decrypted image bytes.

## Comparison

| Approach | Stored file appearance | Original file bytes restored? | PHP requirement | Rough application lines |
| --- | --- | --- | --- | ---: |
| Repeating room-name XOR | Unreadable binary file | Yes | Ordinary byte operations | 80–140 |
| PNG pixel scramble | Valid PNG with noise-like pixels | No; decoded pixels restored | GD and supported image codecs | 140–240 |
| AES-GCM | Unreadable binary file | Yes | OpenSSL extension | 120–200 |

The estimates overlap because storage, upload, serving, and deletion account for much of the work. XOR is smaller because the transformation is simple and omits authentication. PNG scrambling adds the visual effect and image processing. AES-GCM offers standard authenticated encryption with a similarly sized application integration.

Earlier estimates that included migration were approximately 120–220 lines for byte XOR and 170–300 for AES-GCM. Those totals do not apply to the current empty-database scope.

## Performance and verification

Every restored image request requires PHP work instead of serving the original file directly. Whole-file byte processing uses memory proportional to file size; pixel processing also requires decoded image buffers and can be considerably more expensive. Set upload byte and dimension limits before deployment, especially on the planned Raspberry Pi.

Verify room normalization, room `0`, upload/display/deletion, missing files, invalid stored formats, and cleanup after failed uploads. For byte approaches, verify exact byte round trips across supported formats. For pixel scrambling, verify RGB/alpha behavior and decoded pixel round trips with representative still images. For AES-GCM, verify that altered files fail authentication.

No implementation, migration, new private-room behavior, or admin authentication is authorized by this planning document. Choose the image approach and settle its file-format and key/stream details before implementation.
