import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { AUTH_TOKEN } from "constants/AuthConstant";
import AuthService from "services/AuthService";
import { clearStorage, getStorage, setStorage, setStorageR } from "utils/storage";

export const initialState = {
  loading: false,
  message: "",
  showMessage: false,
  redirect: "",
  token: getStorage() || null,
  user: null,
  isAuth: false,
  role: null,
};

export const signIn = createAsyncThunk("auth/login", async (data, { rejectWithValue }) => {
  const { username, password } = data;
  try {
    const response = await AuthService.login({ username, password });
    if (response?.data?.code === 200) {
      const token = response?.data?.data?.token;
      const refreshToken = response?.data?.data?.refreshToken;
      
      setStorage(token);
      setStorageR(refreshToken);
      return token;
    } else {
      return rejectWithValue(response.message?.replace("AUTH: ", ""));
    }
  } catch (err) {
    return rejectWithValue(err?.message || "Errord");
  }
});

// export const signUp = createAsyncThunk('auth/signUp', async (data, { rejectWithValue }) => {
//   const { email, password } = data
//   try {
//     const response = await FirebaseService.signUpEmailRequest(email, password)
//     if (response.user) {
//       const token = response.user.refreshToken;
//       localStorage.setItem(AUTH_TOKEN, response.user.refreshToken);
//       return token;
//     } else {
//       return rejectWithValue(response.message?.replace('Firebase: ', ''));
//     }
//   } catch (err) {
//     return rejectWithValue(err?.message || 'Error')
//   }
// })

export const signOut = createAsyncThunk("auth/signOut", async () => {
  clearStorage();
  localStorage.removeItem(AUTH_TOKEN);
  return "response.data";
});

export const getByToken = createAsyncThunk("auth/getByToken", async (data, { rejectWithValue }) => {
  try {
    const response = await AuthService.getByToken();
    if (response?.data?.code === 200) {
      const user = response?.data?.user;
      return user;
    }
  } catch (err) {
    return rejectWithValue(err?.message || "Error");
  }

});

export const updateUser = createAsyncThunk("auth/updateUser", async (data, { rejectWithValue }) => {
  try {
    const response = await AuthService.updateUser(data);
    if (response?.data?.code === 200) {
      const user = response?.data?.data?.user;
      return user;
    } else {
      return rejectWithValue(response.message?.replace("AUTH: ", ""));
    }
  } catch (err) {
    return rejectWithValue(err?.message || "Error");
  }
});

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    signOut: (state) => {
      state.loading = false;
      state.redirect = "/";
      state.token = null;
      state.user = null;
      state.isAuth = false;
      state.role = null;
    },
    authenticated: (state, action) => {
      state.loading = false;
      state.redirect = "/";
      state.token = action.payload;
    },
    showAuthMessage: (state, action) => {
      state.message = action.payload;
      state.showMessage = true;
      state.loading = false;
    },
    hideAuthMessage: (state) => {
      state.message = "";
      state.showMessage = false;
    },
    signOutSuccess: (state) => {
      state.loading = false;
      state.token = null;
      state.redirect = "/";
    },
    showLoading: (state) => {
      state.loading = true;
    },
    signInSuccess: (state, action) => {
      state.loading = false;
      state.token = action.payload;
    },
    updateUserSuccess: (state, action) => {
      state.loading = false;
      state.user = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(signIn.pending, (state) => {
        state.loading = true;
      })
      .addCase(signIn.fulfilled, (state, action) => {
        state.loading = false;
        state.redirect = "/";
        state.token = action.payload;
      })
      .addCase(signIn.rejected, (state, action) => {
        state.message = action.payload;
        state.showMessage = true;
        state.loading = false;
      })
      .addCase(signOut.fulfilled, (state) => {
        state.loading = false;
        state.token = null;
        state.redirect = "/";
      })
      .addCase(signOut.rejected, (state) => {
        state.loading = false;
        state.token = null;
        state.redirect = "/";
      })
      // .addCase(signUp.pending, (state) => {
      //   state.loading = true
      // })
      // .addCase(signUp.fulfilled, (state, action) => {
      //   state.loading = false
      //   state.redirect = '/'
      //   state.token = action.payload
      // })
      // .addCase(signUp.rejected, (state, action) => {
      //   state.message = action.payload
      //   state.showMessage = true
      //   state.loading = false
      // })
      .addCase(getByToken.pending, (state) => {
        state.loading = true;
        state.role = null;
        
      })
      .addCase(getByToken.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
        state.isAuth = true;
        state.role = action.payload?.role;
      })
      .addCase(getByToken.rejected, (state, action) => {
        state.user = action.user;
        state.showMessage = false;
        state.loading = false;
        state.isAuth = false;
        state.token = null;
        state.redirect = "/";
      })
      .addCase(updateUser.pending, (state) => {
        state.loading = true;
      })
      .addCase(updateUser.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
      })
      .addCase(updateUser.rejected, (state, action) => {
        state.message = action.payload;
        state.showMessage = true;
        state.loading = false;
      });
  },
});

export const {
  authenticated,
  showAuthMessage,
  hideAuthMessage,
  signOutSuccess,
  showLoading,
  signInSuccess,
  updateUserSuccess,
} = authSlice.actions;

export default authSlice.reducer;