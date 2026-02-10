import { combineReducers } from "redux";
import theme from "./slices/themeSlice";
import auth from "./slices/authSlice";
import uploadData from "./slices/uploadDataSlice";

const rootReducer = (asyncReducers) => (state, action) => {
    const combinedReducer = combineReducers({
        theme,
        auth,
        uploadData,
        ...asyncReducers,
    });
    return combinedReducer(state, action);
};
  
export default rootReducer;
