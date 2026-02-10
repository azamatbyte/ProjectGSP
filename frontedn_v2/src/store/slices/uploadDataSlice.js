import { createSlice } from "@reduxjs/toolkit";

const initialState = {
    loading: false,
    error: null,
};

const uploadDataSlice = createSlice({
    name: "uploadData",
    initialState,
    reducers: {
        uploadStart(state) {
            state.loading = true;
            state.error = null;
        },
        uploadSuccess(state, _) {
            state.loading = false;
        },
        uploadFailure(state, _) {
            state.loading = false;
        },
    },
});

export const { uploadStart, uploadSuccess, uploadFailure } = uploadDataSlice.actions;

export default uploadDataSlice.reducer;