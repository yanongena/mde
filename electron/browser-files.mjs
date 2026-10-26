// Formats commonly displayed directly by browsers. Codec support varies by browser.
export const isBrowserFile = (name) =>
  typeof name === "string" &&
  /\.(html?|xhtml|pdf|png|jpe?g|gif|webp|bmp|ico|avif|svg|txt|text|json|xml|css|js|mjs|mp3|wav|ogg|oga|opus|flac|m4a|mp4|m4v|webm|ogv)$/i.test(
    name,
  );
