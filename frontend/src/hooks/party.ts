import { useState, useEffect } from 'react'
import API from 'api/client'
import type { Party } from 'api/client'

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

// iSHARE v3 — submit a claim-based participant.
export const useSubmitParty = () => {
    const Api = new API()
    const [response, setResponse] = useState<any>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<any>(null)

    const submitParty = async (party: Party) => {
        setLoading(true)
        setError(null)
        setResponse(null)
        try {
            const res = await Api.submitParty(party)
            setResponse(res.data)
        } catch (err) {
            setError(err)
        } finally {
            setLoading(false)
        }
    }

    return { submitParty, loading, error, response }
}