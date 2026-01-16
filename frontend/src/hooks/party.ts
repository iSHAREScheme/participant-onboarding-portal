import { useState, useEffect } from 'react'
import API from 'api/client'

export const useSubmitInfo = () => {
    const Api = new API()
    const [response, setResponse] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<any>(null)
    
    const createParty = async (data: any) => {
        setLoading(true)
        setError(null)
        setResponse(null)
        try {
            const response = await Api.submitInfo(data)
            setResponse(response.data)
        } catch (error) {
            setError(error)
        } finally {
            setLoading(false)
        }
    }

    return { createParty, loading, error, response }
}