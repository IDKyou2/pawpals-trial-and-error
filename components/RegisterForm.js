
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import axios from "axios";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import React, { useState, useEffect } from "react";

import { adminCredentials } from "../constants/adminCredentials"; // Admin details

const API_BASE_URL = "http://192.168.1.2:5000";
const API_URL = `${API_BASE_URL}/api/register/register`;

const RegisterForm = ({ onLoginClick }) => {
  const navigation = useNavigation();
  const [profilePic, setProfilePic] = useState(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [address, setAddress] = useState(""); // new
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");


  const checkUsernameAvailability = async (username) => {
    try {
      const res = await axios.post(`${API_BASE_URL}/api/register/check-username`, { username });
      return res.data.exists;
    } catch (err) {
      console.error("Username check failed:", err);
      return false; // Assume available if error
    }
  };

  const handleImageUpload = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please allow access to your photos to upload a profile picture."
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        setProfilePic(result.assets[0]);
        //console.log("User has selected an image:", result.assets[0].uri);
        console.log("User has selected an image.");
      } else {
        console.log("User cancelled image upload.");
      }
    } catch (err) {
      console.error("Image picker error:", err);
      setError("Failed to select image");
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);


    if (password !== confirmPassword) {
      setError("Password and confirm password don't match.");
      setLoading(false);
      return;
    }

    // Email domain validation
    const validDomains = ["@yahoo.com", "@gmail.com", "@hotmail.com"];
    const isValidEmail = validDomains.some((domain) =>
      email.toLowerCase().endsWith(domain)
    );
    // Contact number validation
    const isValidPHNumber = (number) => {
      const regex = /^09\d{9}$/;
      return regex.test(number);
    };

    // Basic validation
    if (
      !username ||
      !fullName ||
      !email ||
      !contact ||
      !address ||
      !password ||
      !confirmPassword
    ) {
      setError("All fields are required!");
      setLoading(false);
      return;
    }

    if (!isValidEmail) {
      setError("Email must be from yahoo.com, gmail.com, or hotmail.com.");
      setLoading(false);
      return;
    }
    if (!isValidPHNumber(contact)) {
      setError("Please enter a valid number.");
      setLoading(false);
      return;
    }
    if (!profilePic) {
      setError("Profile picture is required");
      setLoading(false);
      return;
    }

    try {
      const formData = new FormData();

      // Add profile picture
      formData.append("profilePic", {
        uri: profilePic.uri,
        name: profilePic.fileName || `profile-${Date.now()}.jpg`,
        type: profilePic.mimeType || "image/jpeg",
      });

      // Add other fields
      formData.append("username", username);
      formData.append("fullName", fullName);
      formData.append("email", email);
      formData.append("contact", contact);
      formData.append("password", password);
      formData.append("confirmPassword", confirmPassword);
      formData.append("address", address);  // newly added

      // Log FormData contents for debugging
      for (let [key, value] of formData) {
        //console.log(`Form Data: ${key} =`, value);  //For testing only
      }

      const response = await axios.post(API_URL, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      if (response.data.message) {
        setSuccess(`${response.data.message} Redirecting to login...`);
        setTimeout(() => onLoginClick(), 2000);
      }
    } catch (err) {
      console.error("Registration error:", err);
      console.error("Error response:", err.response?.data);
      setError(
        err.response?.data?.message || err.message || "Registration failed"
      );

    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------- For username ---------------------------------- //
  useEffect(() => {
    if (username.trim().length === 0) {
      setUsernameError("");
      return;
    } else {
      setUsernameError(""); // Clear error if not empty
    }

    const checkUsername = async () => {
      try {
        const isTaken = await checkUsernameAvailability(username);
        if (isTaken) {
          setUsernameError("Username already taken.");
        } else if (username === adminCredentials.username) {
          setUsernameError("Username already taken.");
        } else {
          setUsernameError(""); // Clear error
        }
      } catch (error) {
        console.log("Username check failed:", error);
        setUsernameError("Error checking username.");
      }
    };

    checkUsername(); // Call the async function

  }, [username]);


  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollViewContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.registerFormContainer}>
          <View style={styles.registerLogo}>
            <Image
              source={require("../assets/images/pawpals.png")}
              style={styles.logoImage}
            />
          </View>

          <TouchableOpacity
            style={styles.profilePicContainer}
            onPress={handleImageUpload}
          >
            <Image
              source={
                profilePic
                  ? { uri: profilePic.uri }
                  : require("../assets/images/default-user.png")
              }
              style={styles.profilePic}
            />
            <Image
              source={require("../assets/images/default-image-upload.png")}
              style={styles.uploadIcon}
            />
          </TouchableOpacity>

          <View style={styles.registerForm}>
            {usernameError ? (
              <Text style={{ color: "red" }}>{usernameError}</Text>
            ) : username.length >= 3 ? (
              <Text style={{ color: "green" }}>Username is available.</Text>
            ) : null}
            <TextInput
              style={styles.input}
              placeholder="Username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Full name"
              value={fullName}
              onChangeText={setFullName}
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Contact Number"
              value={contact}
              onChangeText={(text) => {
                const numericText = text.replace(/[^0-9]/g, "");
                if (numericText.length <= 11) {
                  setContact(numericText);
                }
              }}
              keyboardType="phone-pad"
              maxLength={11}
            />
            {/* ----------------------------------------------------------------- Newly added ----------------------------------------- */}
            <TextInput
              style={styles.input}
              placeholder="Address"
              value={address}
              onChangeText={setAddress}
            />
            {/* ------------------------------------------------------------------------------------------------------------------------- */}
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.inputWithIcon}
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!passwordVisible}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.passwordIcon}
                onPress={() => setPasswordVisible(!passwordVisible)}
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

            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.inputWithIcon}
                placeholder="Confirm password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!confirmPasswordVisible}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.passwordIcon}
                onPress={() =>
                  setConfirmPasswordVisible(!confirmPasswordVisible)
                }
              >
                <Image
                  source={
                    confirmPasswordVisible
                      ? require("../assets/images/hide-eyes-updated.png")
                      : require("../assets/images/open-eyes-updated.png")
                  }
                  style={styles.iconImage}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.registerButton}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.registerButtonText}>Register now</Text>
              )}
            </TouchableOpacity>
            {success && <Text style={styles.successMessage}>{success}</Text>}
            {error && <Text style={styles.errorMessage}>{error}</Text>}
          </View>

          <Text style={styles.registerText}>
            Already part of our community?{" "}
            <Text onPress={onLoginClick} style={styles.registerSignUpLinkButton}>
              Login
            </Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor: "#D2B48C",
  },
  scrollViewContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  registerFormContainer: {
    width: "80%",
    maxWidth: 400,
    minHeight: 150,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    padding: 0,
  },
  registerLogo: {
    marginBottom: -50,
  },
  logoImage: {
    width: 200,
    height: 200,
    resizeMode: "contain",
  },
  profilePicContainer: {
    position: "relative",
    marginBottom: 10,
  },
  profilePic: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: "#ccc",
    resizeMode: "cover",
  },
  uploadIcon: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
  },
  registerForm: {
    width: "100%",
    alignItems: "center",
  },
  input: {
    width: "90%",
    padding: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 4,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  passwordContainer: {
    width: "90%",
    position: "relative",
    marginBottom: 15,
  },
  inputWithIcon: {
    width: "100%",
    padding: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 4,
    fontSize: 16,
    paddingRight: 40,
    backgroundColor: "#fff",
  },
  passwordIcon: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: [{ translateY: -10 }],
  },
  iconImage: {
    width: 25,
    height: 20,
  },
  registerButton: {
    width: '90%',
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
  registerButtonText: {
    color: '#6B4E31',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'Roboto',
  },
  registerText: {
    marginTop: 15,
    fontSize: 14,
    textAlign: "center",
    flexDirection: "row",
    marginBottom: 20
  },
  registerSignUpLinkButton: {
    color: '#FFD700',
    textDecorationLine: 'underline',
    fontFamily: 'Roboto',
  },
  errorMessage: {
    color: "red",
    fontSize: 14,
    textAlign: "center",
    marginTop: 10,
  },
  successMessage: {
    color: "#050505",
    fontSize: 14,
    textAlign: "center",
    marginTop: 10,
  },
});

export default RegisterForm;