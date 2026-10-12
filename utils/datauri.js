const getDataUri = (file) => {
    if (!file?.buffer || !file.mimetype?.startsWith("image/")) {
        throw new Error("A valid image file is required.");
    }

    return {
        content: `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
    };
}

export default getDataUri;
