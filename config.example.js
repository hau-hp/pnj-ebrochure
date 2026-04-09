window.__PNJ_APP_CONFIG__ = {
    // Dung khi deploy static len GitHub Pages.
    // Vi du:
    // pnjImportEndpoint: 'https://<project-ref>.functions.supabase.co/pnj-product-import'
    pnjImportEndpoint: '',
    // Endpoint xoa media tren Cloudinary thong qua Supabase Edge Function.
    // Vi du: 'https://<project-ref>.functions.supabase.co/media-library'
    mediaLibraryEndpoint: '',
    // Chỉ cho phép mở admin từ các domain sau.
    adminAllowedOrigins: [
        'http://127.0.0.1:5500',
        'http://localhost:5500',
        'http://127.0.0.1:3000',
        'http://localhost:3000',
        'https://hau-hp.github.io'
    ],
    // Cloudinary unsigned upload preset cho admin upload anh/video.
    cloudinaryCloudName: 'dhe7uziws',
    cloudinaryUploadPreset: 'pnj_unsigned'
};
