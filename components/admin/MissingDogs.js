import React, { useState, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Alert } from 'react-native';
import axios from 'axios';

const API_BASE_URL = "http://192.168.1.10:5000/api/";

const MissingDogs = ({ onNavigateToAdminDashBoard, onNavigateToViewLostDogInfo }) => {
    const [dogs, setDogs] = useState([]);

    useEffect(() => {
        const fetchMissingDogs = async () => {
            try {
                const response = await axios.get(`${API_BASE_URL}all-lost-dogs`);
                if (response.data && Array.isArray(response.data)) {
                    const fetchedDogs = response.data.map(dog => {
                        const normalizedImagePath = dog.imagePath ? dog.imagePath.replace(/\\/g, '/') : null;
                        const imageUrl = normalizedImagePath ? `http://192.168.1.10:5000${normalizedImagePath}` : null;
                        return {
                            id: dog._id,
                            petId: dog.petId,
                            image: imageUrl && normalizedImagePath !== '/uploads/lostDogs/'
                                ? { uri: imageUrl }
                                : require('../../assets/images/dog-icon.png'),
                            originalImageUrl: imageUrl,
                            name: dog.name,
                            category: dog.category,
                            breed: dog.breed,
                            gender: dog.gender,
                            lastSeenLocation: dog.location,
                            size: dog.size,
                            additionalDetails: dog.details,
                            postedBy: dog.userId?.fullName,
                            contactNumber: dog.userId?.contact,
                            userId: dog.userId,
                        };
                    });
                    setDogs(fetchedDogs);
                } else {
                    setDogs([]);
                }
            } catch (error) {
                console.error("Error fetching missing dogs:", error.message);
                setDogs([]);
            }
        };
        fetchMissingDogs();
    }, []);

    const handleImageError = (dogId, imageUrl) => {
        setDogs(prevDogs =>
            prevDogs.map(dog =>
                dog.id === dogId ? { ...dog, image: require('../../assets/images/dog-icon.png') } : dog
            )
        );
    };

    const handleRemoveDog = (dogId) => {
        Alert.alert(
            "Confirm Deletion",
            "Are you sure you want to delete this missing dog data?",
            [
                {
                    text: "Yes",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await axios.delete(`${API_BASE_URL}lostdog/${dogId}`);
                            setDogs(prevDogs => prevDogs.filter(dog => dog.id !== dogId));
                            Alert.alert("Success", "Missing dog deleted successfully!");
                        } catch (error) {
                            console.error("Error deleting dog:", error.message);
                            Alert.alert("Error", "Failed to delete dog. Please try again.");
                        }
                    },
                },
                {
                    text: "No",
                    style: "cancel",
                },
            ],
            { cancelable: true }
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.logoContainer}>
                    <Image
                        source={require('../../assets/images/pawpals.png')}
                        style={styles.logo}
                        resizeMode="contain"
                    />
                </View>
            </View>

            {/* Content */}
            <View style={styles.mainContent}>
                <View style={styles.subHeader}>
                    <TouchableOpacity style={styles.backButton} onPress={onNavigateToAdminDashBoard}>
                        <Image
                            source={require('../../assets/images/back-arrow.png')}
                            style={styles.backButtonImage}
                        />
                    </TouchableOpacity>
                    <Text style={styles.headerText}>Missing Dogs</Text>
                </View>

                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={true}
                >
                    {dogs.length > 0 ? (
                        dogs.map(dog => (
                            <View key={dog.id} style={styles.dogCard}>
                                <Image
                                    source={dog.image}
                                    style={styles.dogImage}
                                    onError={() => handleImageError(dog.id, dog.originalImageUrl)}
                                />
                                <View style={styles.infoContainer}>
                                    <Text style={styles.nameText}>{dog.name}</Text>
                                    <Text style={styles.breedText}>Breed: {dog.breed}</Text>
                                    <Text style={styles.categoryText}>{dog.category}</Text>
                                    <View style={styles.buttonContainer}>
                                        <TouchableOpacity
                                            style={styles.viewButton}
                                            onPress={() => onNavigateToViewLostDogInfo(dog)}
                                        >
                                            <Text style={styles.buttonText}>VIEW</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.removeButton}
                                            onPress={() => handleRemoveDog(dog.id)}
                                        >
                                            <Text style={styles.buttonText}>DELETE</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        ))
                    ) : (
                        <Text style={styles.noDogsText}>No missing dogs found.</Text>
                    )}
                </ScrollView>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F5F5F5',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#6B4E31',
        paddingVertical: 20,
        paddingHorizontal: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 8,
    },
    logoContainer: {
        flex: 1,
        alignItems: 'center',
    },
    logo: {
        width: 100,
        height: 100,
    },
    hamburgerButton: {
        padding: 10,
    },
    hamburger: {
        width: 30,
        height: 20,
        justifyContent: 'space-between',
    },
    hamburgerLine: {
        width: 30,
        height: 3,
        backgroundColor: '#FFD700',
        borderRadius: 2,
    },
    mainContent: {
        flex: 1,
        backgroundColor: '#FFF',
        borderRadius: 20,
        padding: 15,
        marginHorizontal: 10,
        marginVertical: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 4,
    },
    subHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#FFD700',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 4,
    },
    backButtonImage: {
        width: 24,
        height: 24,
        tintColor: '#6B4E31',
    },
    headerText: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#FFD700',
        fontFamily: 'Roboto',
        flex: 1,
        textAlign: 'center',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 20,
    },
    dogCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 15,
        marginBottom: 15,
        marginHorizontal: 10,
        borderRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 4,
    },
    dogImage: {
        width: 50,
        height: 50,
        borderRadius: 25,
        borderWidth: 2,
        borderColor: '#FFD700',
        marginRight: 15,
        backgroundColor: '#F9F9F9',
    },
    infoContainer: {
        flex: 1,
    },
    categoryText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6B4E31',
        fontFamily: 'Roboto',
    },
    nameText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#6B4E31',
        fontFamily: 'Roboto',
        marginBottom: 5,
    },
    breedText: {
        fontSize: 14,
        color: '#6B4E31',
        fontFamily: 'Roboto',
        marginBottom: 5,
    },
    buttonContainer: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 10,
    },
    viewButton: {
        backgroundColor: '#FFD700',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 4,
    },
    removeButton: {
        backgroundColor: '#FF6B6B',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 4,
    },
    buttonText: {
        color: '#6B4E31',
        fontSize: 14,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        fontFamily: 'Roboto',
    },
    noDogsText: {
        fontSize: 16,
        color: '#6B4E31',
        textAlign: 'center',
        marginTop: 20,
        fontFamily: 'Roboto',
    },
});

export default MissingDogs;