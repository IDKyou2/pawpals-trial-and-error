//const API_URL = "http://192.168.1.10:5000/api/login/login";
const API_BASE_URL = "http://192.168.1.10:5000";
const API_URL = `${API_BASE_URL}/api/login/login`; //

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { adminCredentials } from "../constants/adminCredentials"; // Admin details

const LoginPage = ({ onSignUpClick, onLoginSuccess, navigateToAdminDashBoard }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLoginSubmit = async () => {
    // Check for suspicious characters
    const isSuspicious =
      /[{}<>$;'"\\]/.test(username) || /[{}<>$;'"\\]/.test(password);

    if (isSuspicious) {
      console.warn(`[${new Date().toLocaleString()}] Suspicious login attempt.`);
      setErrorMessage("Invalid credentials.");
      setTimeout(() => {
        setErrorMessage("");
      }, 10000);
      return;
    }

    // Admin credentials check
    if (username === adminCredentials.username && password === adminCredentials.password) {
      setIsLoading(true);
      try {
        await AsyncStorage.multiSet([
          ["token", "admin-dummy-token"],
          ["user", JSON.stringify({ username: adminCredentials.username, role: "admin" })],
        ]);
        // Pass a callback to onLoginSuccess to handle navigation after state updates
        onLoginSuccess(true, navigateToAdminDashBoard);
      } catch (error) {
        console.error("Admin login error:", error);
        setErrorMessage("Admin login failed. Please try again.");
        setTimeout(() => {
          setErrorMessage("");
        }, 10000);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Regular user login
    setErrorMessage("");
    setIsLoading(true);

    /*
    try {
      const response = await axios.post(
        API_URL,
        { username, password },
        {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          timeout: 10000,
        }
      );
      if (!API_URL) {
        console.log("API_URL is not defined. Please check your configuration.");
      } else {
        console.log("Check the server if its running. Request made but no response received. Double check this IP inside .env file:", API_BASE_URL);
        setErrorMessage("Connection timeout. Server is under maintenance.")
      }
      if (response.data.success) {
        //log user
        console.log(`[${new Date().toLocaleString()}] User`, username, `has logged in successfully:`);
        await AsyncStorage.multiSet([
          ["token", response.data.token],
          ["user", JSON.stringify(response.data.user)],
        ]);
        onLoginSuccess(false);
      }
    }catch (error) {
      let errorMsg = "Login failed. Please try again.";
      if (error.response) {
        errorMsg = error.response.data.message || errorMsg;
        if (error.response.status === 401) { //401 - wrong user or pass
          //Alert.alert("Login Error", error.response.data.message);
          console.log("Login Error:", error.response.data.message);
          setErrorMessage(errorMsg);
        } else if (error.response.status === 403) {//403 - user banned
          Alert.alert("Account banned", error.response.data.message);
        } else {
          setErrorMessage(errorMsg);
        }
        setTimeout(() => {
          setErrorMessage("");
        }, 10000);
      } else if (error.request) {
        errorMsg = "Network error. Please check your internet connection.";
      } else {
        errorMsg = `Error: ${error.message}`;
        console.log("Error in setting up request:", error.message);
      }
      //setErrorMessage(errorMsg);
    } finally {
      setIsLoading(false);
    }
    */

    try {
      if (!API_URL) {
        console.warn("API_URL is not defined. Check your .env configuration.");
        setErrorMessage("API configuration error. Please contact support.");
        return;
      }

      const response = await axios.post(
        API_URL,
        { username, password },
        {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          timeout: 10000, // 10 seconds
        }
      );

      if (response.data.success) {
        console.log(`[${new Date().toLocaleString()}] User ${username} has logged in successfully.`);
        await AsyncStorage.multiSet([
          ["token", response.data.token],
          ["user", JSON.stringify(response.data.user)],
        ]);
        onLoginSuccess(false);
      } else {
        setErrorMessage("Login failed. Please check your credentials.");
      }

    } catch (error) {
      let errorMsg = "Login failed. Please try again.";

      if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.message || errorMsg;

        if (status === 401) {
          console.warn("Login Error (401):", message);
          errorMsg = message;
        } else if (status === 403) {
          Alert.alert("Account Banned", message);
          return;
        } else {
          console.warn("Server Error:", message);
        }

        setErrorMessage(errorMsg);
        setTimeout(() => setErrorMessage(""), 10000);

      } else if (error.request) {
        console.warn("No response received. Check if the server is running and .env IP is correct:", API_BASE_URL);
        setErrorMessage("Connection timeout. Server may be under maintenance.");
      } else {
        console.error("Request setup error:", error.message);
        setErrorMessage(`Unexpected error: ${error.message}`);
      }

    } finally {
      setIsLoading(false);
    }

  };

  return (
    <View style={styles.outerContainer}>
      <View style={styles.LoginPageContainer}>
        <View style={styles.loginLogo}>
          <Image
            source={require("../assets/images/pawpals.png")}
            style={styles.logoImage}
          />
        </View>

        {errorMessage && (
          <Text style={styles.errorMessage}>{errorMessage}</Text>
        )}

        <View style={styles.LoginPage}>
          <TextInput
            style={styles.input}
            placeholder="Username"
            value={username}
            onChangeText={setUsername}
            editable={!isLoading}
            autoCapitalize="none"
            placeholderTextColor="#6B4E31"
          />

          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.inputWithIcon}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!passwordVisible}
              editable={!isLoading}
              placeholderTextColor="#6B4E31"
              autoCapitalize="none"
            />
            <TouchableOpacity
              onPress={() => setPasswordVisible(!passwordVisible)}
              style={styles.passwordIcon}
              disabled={isLoading}
            >
              <Image
                source={
                  passwordVisible
                    ? require("../assets/images/hide-eyes-updated.png")
                    : require("../assets/images/open-eyes-updated.png")
                }
                style={styles.iconImage}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[
              styles.loginButton,
              isLoading && styles.loginButtonLoading,
            ]}
            onPress={handleLoginSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#6B4E31" />
            ) : (
              <Text style={styles.loginButtonText}>Login</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.loginText}>
          Don't have an account?{" "}
          <Text onPress={onSignUpClick} disabled={isLoading}>
            <Text style={styles.signUpLinkButton}>Signup</Text>
          </Text>
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  LoginPageContainer: {
    width: '80%',
    maxWidth: 400,
    minHeight: 350,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    padding: 20,
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  loginLogo: {
    marginBottom: 10,
  },
  logoImage: {
    width: 200,
    height: 200,
    resizeMode: 'contain',
    opacity: 0.95,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  errorMessage: {
    color: '#FF4D4D',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    fontFamily: 'Roboto',
  },
  LoginPage: {
    width: '100%',
    alignItems: 'center',
  },
  input: {
    width: '100%',
    padding: 12,
    marginBottom: 15,
    borderRadius: 8,
    fontSize: 16,
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    color: '#6B4E31',
    fontFamily: 'Roboto',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  inputWithIcon: {
    width: '100%',
    padding: 12,
    marginBottom: 15,
    borderRadius: 8,
    fontSize: 16,
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    paddingRight: 40,
    color: '#6B4E31',
    fontFamily: 'Roboto',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  passwordContainer: {
    width: '100%',
    position: 'relative',
  },
  passwordIcon: {
    position: 'absolute',
    right: 10,
    top: '50%',
    transform: [{ translateY: -16 }], // Adjust -12 based on the icon's height
  },
  iconImage: {
    width: 25,
    height: 20,
    tintColor: '#6B4E31',
  },
  loginButton: {
    width: '100%',
    padding: 12,
    backgroundColor: '#FFD700',
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  loginButtonLoading: {
    backgroundColor: '#FFD700',
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#6B4E31',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'Roboto',
  },
  loginText: {
    marginTop: 15,
    fontSize: 14,
    textAlign: 'center',
    color: '#6B4E31',
    fontFamily: 'Roboto',
  },
  signUpLinkButton: {
    color: '#FFD700',
    textDecorationLine: 'underline',
    fontFamily: 'Roboto',
  },
});

export default LoginPage;